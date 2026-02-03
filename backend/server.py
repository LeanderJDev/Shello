import os
import asyncio
import json
from dotenv import load_dotenv
import websockets
import traceback

from database import DatabaseClient
from shello_logging import setup_logging, log_with
from logging import INFO, ERROR

# in-memory room -> set(websocket) and socket -> set(room)
room_sockets = {}
socket_rooms = {}

# initialize logger with fallback
logger = None
try:
    logger = setup_logging()
except Exception as e:
    # fallback: print to stderr; logger remains None so safe_log prints
    print(f"Warning: failed to initialize structured logger: {e}", flush=True)


def safe_log(
    level,
    *,
    event=None,
    socket=None,
    payload=None,
    result=None,
    error=None,
    audience=None,
):
    # Use structured logger if available, otherwise fallback to stderr
    try:
        if logger:
            log_with(
                logger,
                level,
                socket=socket,
                event=event,
                payload=payload,
                result=result,
                error=error,
                audience=audience,
            )
        else:
            ts = __import__("datetime").datetime.utcnow().isoformat() + "Z"
            print(
                f"{ts} {level} event={event} socket={socket} payload={payload} result={result} error={error} audience={audience}",
                flush=True,
            )
    except Exception:
        # last resort
        print(
            f"Logging failure for event={event}: {traceback.format_exc()}", flush=True
        )


def add_socket_to_room(ws, room_id: int):
    room = room_sockets.setdefault(int(room_id), set())
    room.add(ws)
    socket_rooms.setdefault(ws, set()).add(int(room_id))


def remove_socket_from_room(ws, room_id: int):
    r = room_sockets.get(int(room_id))
    if r and ws in r:
        r.discard(ws)
    s = socket_rooms.get(ws)
    if s and int(room_id) in s:
        s.discard(int(room_id))


async def broadcast_event(room_id: int, event: str, payload: dict):
    sockets = list(room_sockets.get(int(room_id), set()))
    audience = len(sockets)
    if audience == 0:
        log_with(
            logger,
            INFO,
            socket=None,
            event=event,
            payload=payload,
            result="no listeners",
            audience=0,
        )
        return
    msg = json.dumps({"event": event, "payload": payload})
    for s in sockets:
        try:
            await s.send(msg)
        except Exception as e:
            log_with(
                logger,
                ERROR,
                socket=str(getattr(s, "remote_address", "-")),
                event=event,
                payload=payload,
                error=str(e),
            )
    log_with(
        logger,
        INFO,
        socket=None,
        event=event,
        payload=payload,
        result="broadcast sent",
        audience=audience,
    )


async def emit_event(ws, event: str, payload: dict):
    try:
        await ws.send(json.dumps({"event": event, "payload": payload}))
        log_with(
            logger,
            INFO,
            socket=str(getattr(ws, "remote_address", "-")),
            event=event,
            payload=payload,
            result="sent",
        )
    except Exception as e:
        log_with(
            logger,
            ERROR,
            socket=str(getattr(ws, "remote_address", "-")),
            event=event,
            payload=payload,
            error=str(e),
        )


async def handle_client(websocket, dbClient: DatabaseClient):
    """Handle a single WebSocket client connection"""
    remote = websocket.remote_address
    log_with(
        logger,
        INFO,
        socket=str(remote),
        event="connect",
        payload=None,
        result="connected",
    )

    
    user_id = 0  # guest by default

    users:dict = dbClient.get_users()
    for u in users:
        if not isinstance(u, dict):
            continue
        name = u.get("Name") or u.get("Username") or u.get("username")
        uid = u.get("ID") or u.get("id") or u.get("UserID") or u.get("user_id")
        if name == "guest":
            user_id = uid
            break

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                await websocket.send(
                    json.dumps({"error": "Invalid JSON", "status": "error"})
                )
                continue

            func = data.get("func", "")
            log_with(
                logger,
                INFO,
                socket=str(remote),
                event="received",
                payload={"func": func, "data": data},
            )

            result = None
            error = None

            # dispatch
            if func in ("msg", "send_message"):
                # send message and broadcast
                room_id = data.get("room_id")
                text = (data.get("text") or "").strip()
                if not room_id or not text:
                    error = "room_id and text required"
                else:
                    try:
                        ok = dbClient.create_message(user_id, room_id, text)
                    except Exception as e:
                        error = f"db error: {e}"
                        ok = False
                    if ok:
                        try:
                            messages = dbClient.get_messages(room_id)
                            result = messages
                        except Exception as e:
                            error = f"db error: {e}"
                            result = None
                        # broadcast new_message with last message if available
                        try:
                            last = (
                                messages[-1]
                                if isinstance(messages, list) and messages
                                else None
                            )
                            await broadcast_event(
                                room_id, "new_message", {"message": last}
                            )
                        except Exception as e:
                            log_with(
                                logger,
                                ERROR,
                                socket=str(remote),
                                event="broadcast_new_message",
                                payload={"room_id": room_id},
                                error=str(e),
                            )

            elif func == "create_user":
                username = (data.get("username") or "").strip()
                if not username:
                    error = "username required"
                else:
                    try:
                        exists = dbClient.get_user_by_name(username)
                    except Exception as e:
                        error = f"db error: {e}"
                        exists = {"error": "lookup failed"}
                    if exists and exists.get("error") is None:
                        error = "user already exists"
                    else:
                        try:
                            new_id = dbClient.create_user(username)
                        except Exception as e:
                            error = f"db error: {e}"
                            new_id = None
                        if new_id:
                            user_id = new_id  # Update the tracked user_id
                            result = {"username": username, "user_id": new_id}

            elif func == "create_room":
                room_name = (data.get("room_name") or "").strip()
                if not room_name:
                    error = "room_name required"
                else:
                    try:
                        room_id = dbClient.create_room(user_id, room_name)
                        result = {"room_id": room_id, "room_name": room_name}
                        # broadcast room_created to all
                        await broadcast_event(
                            room_id,
                            "room_created",
                            {"room_id": room_id, "room_name": room_name},
                        )
                    except Exception as e:
                        error = f"db error: {e}"

            elif func == "get_rooms":
                try:
                    result = dbClient.get_rooms()
                    # Füge MemberCount hinzu basierend auf aktiven Verbindungen
                    if isinstance(result, list):
                        for room in result:
                            room_id = room.get("ID") or room.get("id")
                            if room_id:
                                # Zähle aktive WebSockets in diesem Raum
                                member_count = len(room_sockets.get(room_id, set()))
                                room["MemberCount"] = member_count
                except Exception as e:
                    error = f"db error: {e}"

            elif func == "get_messages":
                room_id = data.get("room_id")
                if not room_id:
                    error = "room_id required"
                else:
                    try:
                        result = dbClient.get_messages(room_id)
                    except Exception as e:
                        error = f"db error: {e}"

            elif func == "edit_room_name":
                room_id = data.get("room_id")
                new_name = (data.get("new_name") or "").strip()
                if not room_id or not new_name:
                    error = "room_id and new_name required"
                else:
                    try:
                        res = dbClient.edit_room_name(room_id, new_name)
                        result = res
                        await broadcast_event(
                            room_id,
                            "room_updated",
                            {"room_id": room_id, "new_name": new_name},
                        )
                    except Exception as e:
                        error = f"db error: {e}"

            elif func == "join_room":
                room_id = data.get("room_id")
                join_user = data.get("user_id", user_id)
                if not room_id:
                    error = "room_id required"
                else:
                    # optional: validate room exists
                    try:
                        rooms = dbClient.get_rooms()
                        found = False
                        if isinstance(rooms, list):
                            for r in rooms:
                                rid = r.get("ID") or r.get("id")
                                if str(rid) == str(room_id):
                                    found = True
                                    break
                        if not found:
                            error = "room not found"
                        else:
                            add_socket_to_room(websocket, int(room_id))
                            # get user info
                            user = dbClient.get_user_by_ID(join_user)
                            uname = (
                                user.get("username")
                                if user and not user.get("error")
                                else None
                            )
                            await broadcast_event(
                                room_id,
                                "user_joined",
                                {"user_id": join_user, "username": uname},
                            )
                            result = {"room_id": room_id}
                    except Exception as e:
                        error = f"db error: {e}"

            elif func == "leave_room":
                room_id = data.get("room_id")
                leave_user = data.get("user_id", user_id)
                if not room_id:
                    error = "room_id required"
                else:
                    try:
                        remove_socket_from_room(websocket, int(room_id))
                        await broadcast_event(
                            room_id, "user_left", {"user_id": leave_user}
                        )
                        result = {"room_id": room_id}
                    except Exception as e:
                        error = f"db error: {e}"

            elif func == "login_as":
                username = (data.get("username") or "").strip()
                if not username:
                    error = "username required"
                else:
                    try:
                        user = dbClient.get_user_by_name(username)
                    except Exception as e:
                        error = f"db error: {e}"
                        user = {"error": "lookup failed"}
                    if user and user.get("error") is None:
                        user_id = user.get("user_id")
                        result = user
                    else:
                        error = "User not found."

            elif func == "nameof_user":
                _user_id = data.get("user_id")
                if not _user_id:
                    error = "user_id required"
                else:
                    try:
                        user = dbClient.get_user_by_ID(_user_id)
                    except Exception as e:
                        error = f"db error: {e}"
                        user = {"error": "lookup failed"}
                    if user and user.get("error") is None:
                        result = user
                    else:
                        error = "User not found."

            elif func == "post_readconfirmation":
                message_id = data.get("message_id") or data.get("MessageID")
                rc_user = data.get("user_id", user_id)
                if not message_id:
                    error = "message_id required"
                else:
                    try:
                        res = dbClient.post_readconfirmation(message_id, rc_user)
                        result = res
                        # broadcast readconfirmation_updated to room/author: best-effort
                        try:
                            await broadcast_event(
                                None,
                                "readconfirmation_updated",
                                {"message_id": message_id, "user_id": rc_user},
                            )
                        except Exception:
                            pass
                    except Exception as e:
                        error = f"db error: {e}"

            elif func == "get_readconfirmation":
                message_id = data.get("message_id") or data.get("MessageID")
                if not message_id:
                    error = "message_id required"
                else:
                    try:
                        result = dbClient.get_readconfirmation(message_id)
                    except Exception as e:
                        error = f"db error: {e}"

            elif func == "delete_msg":
                message_id = data.get("message_id") or data.get("MessageID")
                room_id = data.get("room_id")
                if not message_id:
                    error = "message_id required"
                else:
                    try:
                        res = dbClient.delete_message(message_id)
                        result = res
                        # broadcast message_deleted to room: best-effort
                        if room_id:
                            try:
                                await broadcast_event(
                                    room_id,
                                    "message_deleted",
                                    {"message_id": message_id},
                                )
                            except Exception:
                                pass
                    except Exception as e:
                        error = f"db error: {e}"

            else:
                error = f"Unknown function: {func}"

            # normalize possible DB error payloads
            try:
                if (
                    error is None
                    and result is not None
                    and isinstance(result, dict)
                    and result.get("error") is not None
                ):
                    error = result.get("error")
                    result = None
            except Exception:
                pass

            response = {
                "result": result,
                "error": error,
                "status": "error" if error else "ok",
                "response": func,
            }
            await websocket.send(json.dumps(response))
            log_with(
                logger,
                INFO,
                socket=str(remote),
                event="response",
                payload={"response": response},
            )

    except websockets.exceptions.ConnectionClosed:
        log_with(
            logger,
            INFO,
            socket=str(remote),
            event="disconnect",
            payload=None,
            result="disconnected",
        )
        # cleanup socket from rooms
        rooms = (
            socket_rooms.get(websocket, set()).copy()
            if socket_rooms.get(websocket)
            else set()
        )
        for rid in rooms:
            remove_socket_from_room(websocket, rid)
            # broadcast leave
            try:
                asyncio.create_task(
                    broadcast_event(rid, "user_left", {"user_id": user_id})
                )
            except Exception:
                pass


async def main(serverPort, apiKey, apiUrl):
    dbClient = DatabaseClient(apiUrl, apiKey)

    try:
        rooms = dbClient.get_rooms()
        print("Connected to database, available rooms:", len(rooms) if rooms else 0)
    except Exception as e:
        print(f"Warning: Could not connect to database: {e}")

    async with websockets.serve(
        lambda ws: handle_client(ws, dbClient), serverPort["host"], serverPort["port"]
    ):
        print(
            f"WebSocket server running on ws://{serverPort['host']}:{serverPort['port']}/ws"
        )
        await asyncio.Future()


if __name__ == "__main__":
    load_dotenv()  # lädt .env aus Projektroot

    SHELLO_API_KEY = os.getenv("SHELLO_API_KEY")
    if not SHELLO_API_KEY:
        print("Warning: SHELLO_API_KEY not set in environment")
        raise ValueError(
            "SHELLO_API_KEY not set in environment, please create a .env file"
        )

    SHELLO_API_URL = os.getenv("SHELLO_API_URL")
    if not SHELLO_API_URL:
        print("Warning: SHELLO_API_URL not set in environment")
        raise ValueError(
            "SHELLO_API_URL not set in environment, please create a .env file"
        )
    print(f"Connecting to API URL: {SHELLO_API_URL}")

    # configure host/port from environment
    server_host = os.getenv("SHELLO_WS_HOST", "localhost")
    try:
        server_port = int(os.getenv("SHELLO_WS_PORT", "12000"))
    except Exception:
        server_port = 12000

    server_addr = {"host": server_host, "port": server_port}

    try:
        asyncio.run(main(server_addr, SHELLO_API_KEY, SHELLO_API_URL))
    except KeyboardInterrupt:
        print("\nServer shut down.")
