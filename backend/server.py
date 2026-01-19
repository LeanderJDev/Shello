"""
The Chat server of our project

it uses WebSockets to communicate with the client

the messages are forwarded to the database REST API
"""

import os
import asyncio
import json
from dotenv import load_dotenv
import requests
import websockets


class DatabaseClient:
    def __init__(self, api_url, api_key):
        self.api_url = api_url
        self.api_key = api_key

    def request(
        self,
        endpoint,
        method="GET",
        body=None,
    ):
        if method == "GET":
            r = requests.get(
                f"{self.api_url+endpoint}", headers={"api-key": self.api_key}
            )
            #r.raise_for_status()
            #print(r.json());
            return r.json()
        if method == "POST":
            r = requests.post(
                f"{self.api_url+endpoint}",
                headers={"api-key": self.api_key, "Content-Type": "application/json"},
                json=body,
            )
            #r.raise_for_status()  # Might need to parse response message
            #print(r.json());
            return r.json()
        raise ValueError("Unsupported HTTP method: " + method)

    def create_room(self, user_id, room_name):
        data = {"UserID": user_id, "Roomname": room_name}
        room = self.request("/rooms", method="POST", body=data)
        return room

    def create_user(self, username):
        print(username)
        data = {"Username": username}
        user = self.request("/user", method="POST", body=data)
        return user

    def create_message(self, user_id, room_id, content):
        data = {"UserID": user_id, "RoomID": room_id, "Message": content}
        message = self.request("/messages", method="POST", body=data)
        return message

    def get_rooms(self):
        rooms = self.request("/rooms", method="GET")
        return rooms

    def get_messages(self, room_id):
        messages = self.request(f"/messages?RoomID={room_id}", method="GET")
        return messages

    def edit_room_name(self, room_id, new_name):
        data = {"RoomID": room_id, "Name": new_name}
        room = self.request(f"/rooms", method="PATCH", body=data)
        return room
    
    def get_user_by_name(self, username):
        users = self.request(f"/user?Username={username}", method="GET")
        if users[0] and not users[0].get("error"):
            return users[0].get("ID")
        return None

user_id = 0 # logged in as guest by default

async def handle_client(websocket, dbClient):
    """Handle a single WebSocket client connection"""
    print(f"Client connected: {websocket.remote_address}")
    
    try:
        async for message in websocket:
            global user_id
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
                        username = data.get("username").strip()
                        if not username or username.strip().lower() == "guest":
                            error = "username required"
                        elif dbClient.get_user_by_name(username) is not None:
                            error = "user already exists"
                        else:
                            result = dbClient.create_user(username)
                    
                    case "create_room":
                        room_name = data.get("room_name").strip()
                        if not room_name:
                            error = "room_name required"
                        else:
                            result = dbClient.create_room(user_id, room_name)
                    
                    case "msg":
                        room_id = data.get("room_id")
                        text = data.get("text").strip()
                        if not room_id or not text:
                            error = "room_id and text required"
                        elif room_id == -1:
                            error = "No room selected."
                        else:
                            result = dbClient.create_message(user_id, room_id, text)
                            if result is not None and result.get("error") is None:
                                result = text
                    
                    case "get_rooms":
                        result = dbClient.get_rooms()
                    
                    case "get_messages":
                        room_id = data.get("room_id")
                        if not room_id:
                            error = "room_id required"
                        else:
                            result = dbClient.get_messages(room_id)
                    
                    case "edit_room_name":
                        room_id = data.get("room_id")
                        new_name = data.get("new_name").strip()
                        if not room_id or not new_name:
                            error = "room_id and new_name required"
                        else:
                            result = dbClient.edit_room_name(room_id, new_name)

                    case "login_as":
                        username = data.get("username").strip()
                        if not username:
                            error = "username required"
                        elif username == "guest":
                            user_id = 0  # guest user id
                        elif dbClient.get_user_by_name(username) is None:
                            error = "user does not exist"
                        else:
                            user_id = dbClient.get_user_by_name(username)
                            error = None
                            result = {"Username": username, "user_id": user_id}

                    case _:
                        error = f"Unknown function: {func}"
                
                print(f"Result: {result}")
                try:
                    if result is not None and result.get("error") is not None:
                        error = result.get("error")
                        result = None
                except AttributeError:
                    pass
                
                # Echo back with result
                response = {
                    "result": result,
                    "error": error,
                    "status": "error" if error else "ok",
                    "response": func
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
        "localhost",
        serverPort
    ):
        print(f"WebSocket server running on ws://localhost:{serverPort}/ws")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    load_dotenv()  # lädt .env aus Projektroot

    SHELLO_API_KEY = os.getenv("SHELLO_API_KEY")
    if not SHELLO_API_KEY:
        print("Warning: SHELLO_API_KEY not set in environment")

    SHELLO_API_URL = os.getenv("SHELLO_API_URL")
    if not SHELLO_API_URL:
        print("Warning: SHELLO_API_URL not set in environment")

    serverPort = 12000
    
    try:
        asyncio.run(main(serverPort, SHELLO_API_KEY, SHELLO_API_URL))
    except KeyboardInterrupt:
        print("\nServer shut down.")
