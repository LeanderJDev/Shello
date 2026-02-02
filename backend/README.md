# Backend for Shello

## Overview

-   DatabaseClient: Manages interactions with the database.
-   SocketServer: Handles real-time communication with clients.

## DatabaseClient

Handles requests to REST API of provided database.

There are three endpoints:

-   `/rooms`: for managing chat rooms.
    -   GET: Retrieve all chat rooms.
    -   POST: Create a new chat room.
-   `/user`: for managing user data.
    -   POST: Create a new user.
    -   GET: Read available users
    -   PATCH: Update username
    -   DELETE: Delete user
-   `/messages`: for managing chat messages.
    -   GET: Retrieve messages for a specific room.
    -   POST: Send a new message to a room.
-   `/readconfirmation`: (optional)
    -   POST: Create read confirmation for user and message
        -GET: Get read confirmations for message

These get wrapped in methods of the `DatabaseClient`

Available DatabaseClient methods (summary)

-   create_user(username)
-   get_users() / get_user(user_id)
-   change_user(user_id, new_name)
-   delete_user(user_id)
-   create_room(user_id, room_name)
-   get_rooms()
-   change_room(room_id, new_name)
-   delete_room(room_id)
-   create_message(user_id, room_id, content)
-   get_messages(room_id)
-   delete_message(message_id)
-   post_readconfirmation(message_id, user_id)
-   get_readconfirmation(message_id)

## SocketServer

Handles real-time communication with clients using WebSockets.

Incoming events (Client → Server)

-   `create_user` — payload: { username } → reply with created user id.
-   `switch_user` — payload: { userId } → switch current identity for the socket.
-   `get_rooms` — no payload → reply list of rooms.
-   `create_room` — payload: { userId, roomName } → reply room id.
-   `join_room` / `leave_room` — payload: { roomId, userId } → server manages socket → room mapping.
-   `send_message` — payload: { roomId, userId, text } → server stores message and emits to room.
-   `get_messages` — payload: { roomId } → reply messages for room.
-   `change_user` / `delete_user` — payloads for updating/deleting users.
-   `change_room` / `delete_room` — payloads for updating/deleting rooms.
-   `post_readconfirmation` / `get_readconfirmation` — optional read receipts.

Outgoing events (Server → Clients)

-   `new_message` — emitted to a room when a message is created.
-   `user_joined` / `user_left` — notify room members on joins/leaves.
-   `room_created` / `room_updated` / `room_deleted` — notify relevant clients.
-   `user_updated` / `user_deleted` — notify relevant clients.
-   `message_deleted` — notify room.
-   `readconfirmation_updated` — notify room/author.
-   `error` / `ack` — direct replies to requesters.

Design notes

-   The SocketServer should keep a mapping room → set(sockets) and only forward room-specific events to those sockets (multicast).
-   Server-side authorization: verify API key / membership before performing DB actions (do not trust client-supplied room membership).
-   DatabaseClient calls should reply to the requester and trigger broadcasts where appropriate (e.g., after create_message).
-   For development the DatabaseClient supports both REST backends and a local SQLite file (see code).

Running & env

-   Required env vars (load via .env): SHELLO_API_URL, SHELLO_API_KEY, SHELLO_WS_PORT (optional)
-   For slow external APIs, configure timeouts and measure request durations.

Testing

-   A small integration tester (api_test.py) exists to exercise REST endpoints and measure latency; the SocketServer should use the same DatabaseClient methods to keep behaviour consistent.

Implementation option

-   You may implement a minimal SocketServer using Python's `websockets` or `asyncio` or use a higher-level lib (socket.io) if cross-language clients are needed.
