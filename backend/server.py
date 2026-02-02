import os
import asyncio
import json
from dotenv import load_dotenv
import websockets

from database import DatabaseClient


async def handle_client(websocket, dbClient):
    """Handle a single WebSocket client connection"""
    print(f"Client connected: {websocket.remote_address}")

    user_id = 0  # logged in as guest by default

    try:
        async for message in websocket:
            try:
                # Parse incoming JSON message
                data = json.loads(message)
                print(f"Received: {data}")

                # zeugs verarbeiten
                func = data.get("func", "")
                result: dict | None = None
                error = None

                match func:
                    case "create_user":
                        username = (data.get("username") or "").strip()
                        if not username or username.strip().lower() == "guest":
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
                                    result = {"username": username, "user_id": new_id}

                    case "create_room":
                        room_name = (data.get("room_name") or "").strip()
                        if not room_name:
                            error = "room_name required"
                        else:
                            try:
                                result = dbClient.create_room(user_id, room_name)
                            except Exception as e:
                                error = f"db error: {e}"

                    case "msg":
                        room_id = data.get("room_id")
                        text = (data.get("text") or "").strip()
                        if not room_id or not text:
                            error = "room_id and text required"
                        elif room_id == -1:
                            error = "No room selected."
                        else:
                            try:
                                ok = dbClient.create_message(user_id, room_id, text)
                            except Exception as e:
                                error = f"db error: {e}"
                                ok = False
                            if not error and ok:
                                try:
                                    result = dbClient.get_messages(room_id)
                                except Exception as e:
                                    error = f"db error: {e}"

                    case "get_rooms":
                        try:
                            result = dbClient.get_rooms()
                        except Exception as e:
                            error = f"db error: {e}"

                    case "get_messages":
                        room_id = data.get("room_id")
                        if not room_id:
                            error = "room_id required"
                        else:
                            try:
                                result = dbClient.get_messages(room_id)
                            except Exception as e:
                                error = f"db error: {e}"

                    case "edit_room_name":
                        room_id = data.get("room_id")
                        new_name = (data.get("new_name") or "").strip()
                        if not room_id or not new_name:
                            error = "room_id and new_name required"
                        else:
                            try:
                                result = dbClient.edit_room_name(room_id, new_name)
                            except Exception as e:
                                error = f"db error: {e}"

                    case "login_as":
                        username = (data.get("username") or "").strip()
                        if not username:
                            error = "username required"
                            break
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

                    case "nameof_user":
                        _user_id = data.get("user_id")
                        if not _user_id:
                            error = "user_id required"
                            break
                        try:
                            user = dbClient.get_user_by_ID(_user_id)
                        except Exception as e:
                            error = f"db error: {e}"
                            user = {"error": "lookup failed"}
                        if user and user.get("error") is None:
                            result = user
                        else:
                            error = "User not found."

                    case _:
                        error = f"Unknown function: {func}"

                print(f"Result: {result}, Error: {error}")
                try:
                    if (
                        error is None
                        and result is not None
                        and result.get("error") is not None
                    ):
                        error = result.get("error")
                        result = None
                except AttributeError:
                    pass

                # Echo back with result
                response = {
                    "result": result,
                    "error": error,
                    "status": "error" if error else "ok",
                    "response": func,
                }

                await websocket.send(json.dumps(response))

            except json.JSONDecodeError as e:
                error_msg = {"error": "Invalid JSON", "status": "error"}
                await websocket.send(json.dumps(error_msg))

    except websockets.exceptions.ConnectionClosed:
        print(f"Client disconnected: {websocket.remote_address}")


async def main(serverPort, apiKey, apiUrl):
    dbClient = DatabaseClient(apiUrl, apiKey)

    try:
        rooms = dbClient.get_rooms()
        print("Connected to database, available rooms:", len(rooms) if rooms else 0)
    except Exception as e:
        print(f"Warning: Could not connect to database: {e}")

    async with websockets.serve(
        lambda ws: handle_client(ws, dbClient),
        serverPort["host"],
        serverPort["port"],
    ):
        print(
            f"WebSocket server running on ws://{serverPort['host']}:{serverPort['port']}/ws"
        )
        await asyncio.Future()  # run forever


def testDatabaseAPI(apiKey, apiUrl):
    dbClient = DatabaseClient(apiUrl, apiKey)

    TEST_USER_NAME = "Test User"
    TEST_ROOM_NAME = "Test Room"
    TEST_MESSAGE_TEXT = "Hello World"

    # 1. get existing rooms
    rooms = dbClient.get_rooms()
    print(f"Existing rooms: {rooms}")

    # 2. create "Test User"
    user_id = dbClient.create_user(TEST_USER_NAME)
    if not user_id:
        print("Failed to create user")
        return

    print(f"Created user ID: {user_id}")
    # 3. create "Test Room"
    room_id = dbClient.create_room(user_id, TEST_ROOM_NAME)
    if not room_id:
        print("Failed to create room")
        return
    print(f"Created room ID: {room_id}")
    # 4. post "Hello World" message
    message_success = dbClient.create_message(user_id, room_id, TEST_MESSAGE_TEXT)
    if not message_success:
        print("Failed to post message")
        return
    # 5. get messages in "Test Room"
    messages = dbClient.get_messages(room_id)
    print(f"Messages in room ID {room_id}: {messages}")
    # 6. change room name
    new_room_name = "Renamed Test Room"
    dbClient.change_room(room_id, new_room_name)
    print(f"Changed room ID {room_id} name to {new_room_name}")

    # 7. delete created entities
    dbClient.delete_message(messages[0].get("MessageID"))
    print(f"Deleted message ID: {messages[0].get("MessageID")}")
    dbClient.delete_room(room_id)
    print(f"Deleted room ID: {room_id}")
    dbClient.delete_user(user_id)
    print(f"Deleted user ID: {user_id}")


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
