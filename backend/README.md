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
-   `/users`: for managing user data.
    -   POST: Create a new user.
-   `/messages`: for managing chat messages.
    -   GET: Retrieve messages for a specific room.
    -   POST: Send a new message to a room.

These get wrapped in methods of the `DatabaseClient`

## SocketServer

Handles real-time communication with clients using WebSockets.

The server listens for the following events:

-   `create_user`: Allows the client to create a new user.
-   `switch_user`: Allows the client to switch to a different user.
-   `get_rooms`: Retrieves the list of available chat rooms.
-   `create_room`: Allows a user to create a new chat room.
-   `join_room`: Allows a user to join a specific chat room.
-   `leave_room`: Allows a user to leave a specific chat room.
-   `send_message`: Receives a message from a user and broadcasts it to all users in the same room.

The server emits the following events:

-   `new_message`: Broadcasts a new message to all users in a room.
-   `user_joined`: Notifies users in a room when a new user joins.
-   `user_left`: Notifies users in a room when a user leaves.

The `SocketServer` uses the `DatabaseClient` to store and retrieve messages and user data as needed.

We can use Sockets and implement everything ourselves or we use a library like Socket.IO to simplify the process.
