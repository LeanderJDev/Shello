# Backend for Shello

## Overview

- DatabaseClient: Manages interactions with the database.
- SocketServer: Handles real-time communication with clients.

## DatabaseClient

Handles requests to the REST API of the provided database. There are two different DatabaseClient implementations in the repo with slightly different behaviours; tests and the WebSocket server use different variants (see below).

Endpoints (API):

- `/rooms` — manage chat rooms (GET, POST, PATCH, DELETE)
- `/user` — manage users (GET, POST, PATCH, DELETE)
- `/messages` — manage messages (GET, POST, DELETE)
- `/readconfirmation` — optional read receipts (POST, GET)

Available methods (summary) — see concrete implementations in source files for exact return types:

- create_user(username)
- get_users() / get_user(user_id)
- change_user(user_id, new_name)
- delete_user(user_id)
- create_room(user_id, room_name)
- get_rooms()
- change_room(room_id, new_name)
- delete_room(room_id)
- create_message(user_id, room_id, content)
- get_messages(room_id)
- delete_message(message_id)
- post_readconfirmation(message_id, user_id)
- get_readconfirmation(message_id)

Concrete implementations

- [backend/database.py](backend/database.py): a test-oriented client. It calls `requests.request` with `raise_for_status()` and returns simplified values useful for tests:
    - `create_user(...)` → returns numeric `ID` (or `None`).
    - `create_room(...)` → returns numeric `ID`.
    - `create_message(...)` → returns `True` on success (checks returned JSON message field).
    - Additional helpers: `get_users`, `get_user`, `change_user`, `delete_*`, `post_readconfirmation`, `get_readconfirmation`.

- [backend/server.py](backend/server.py): an embedded DatabaseClient used by the WebSocket server. It performs `requests.get`/`post` and returns raw parsed JSON (no `raise_for_status`). The WebSocket server code expects JSON objects with keys such as `Username` and `ID` when creating/reading users.

Notes about return types and error handling

- The two clients return different shapes (IDs/booleans vs raw dicts). Code using them must expect the correct return types.
- `backend/database.py` is stricter (raises on HTTP errors) while `backend/server.py`'s client is permissive and returns raw JSON; server-side code checks for an `error` key in responses.

## SocketServer

Handles WebSocket communication using a request/response JSON protocol (implemented in [backend/server.py](backend/server.py)).

Message format (client → server):

- JSON object with a `func` field, e.g. `{ "func": "create_user", "username": "Alice" }`.

Server reply format:

- `{ "result": <object|null>, "error": <string|null>, "status": "ok"|"error", "response": "<func>" }`

Implemented `func` actions (current implementation in [backend/server.py](backend/server.py)):

- `create_user` — payload: `{ "username": "..." }`. Validates username (non-empty, not "guest"); uses DB API to create user; returns `{ "username": ..., "user_id": ... }` on success.
- `create_room` — payload: `{ "room_name": "..." }`. Creates a room via DB and returns DB response.
- `msg` — payload: `{ "room_id": <id>, "text": "..." }`. Posts a message; on success the server returns the messages for that room.
- `get_rooms` — no payload. Returns list of rooms.
- `get_messages` — payload: `{ "room_id": <id> }`. Returns messages for the room.
- `edit_room_name` — payload: `{ "room_id": <id>, "new_name": "..." }`. Updates room name.
- `login_as` — payload: `{ "username": "..." }`. Looks up user by name and sets the session `user_id` for that socket.
- `nameof_user` — payload: `{ "user_id": <id> }`. Returns username info for the given ID.

Differences from previous README design / important notes

- No multicast/broadcast: the current server implementation replies only to the requesting client. There is no mapping of `room -> sockets` and no `new_message` / `user_joined` broadcast implementation yet.
- Path vs host: the server code binds to `localhost` and a port via `websockets.serve(..., "localhost", port)`. The code prints `ws://localhost:<port>/ws` but does not enforce the `/ws` path.
- Error handling: server expects DB responses to possibly contain an `error` field; it converts DB errors into the `error` field of its own replies.

Running & env

- Required env vars (load via .env): `SHELLO_API_URL`, `SHELLO_API_KEY`, `SHELLO_WS_PORT` (optional). The server prints a message with the host and port it listens on (default port in code: 12000).

Testing

- A small integration tester (`api_test.py`) exists to exercise REST endpoints and measure latency; `backend/database.py` is written to be used by tests. The WebSocket server uses its embedded DatabaseClient variant — verify return shapes when integrating tests with the live server.

Summary

- The README previously described a richer socket API including broadcasts and room membership multicast. The current implementation provides a smaller request/response WebSocket API (see implemented `func` list above) and uses two DatabaseClient variants with different return shapes (`backend/database.py` for tests, `backend/server.py` for the WebSocket server).
- See [backend/server.py](backend/server.py) and [backend/database.py](backend/database.py) for exact behaviour and return types.
