"""
The Chat server of our project

it uses WebSockets to communicate with the client

the messages are forwarded to the database REST API
"""

import os
from socket import *
from dotenv import load_dotenv
import requests


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
        url = f"{self.api_url}{endpoint}"
        headers = {"api-key": self.api_key, "Content-Type": "application/json"}
        r = requests.request(method, url, headers=headers, json=body, timeout=60)
        r.raise_for_status()
        # try parse json, otherwise return raw text
        try:
            return r.json()
        except Exception:
            return r.text

    def create_room(self, user_id, room_name):
        data = {"UserID": user_id, "Roomname": room_name}
        room = self.request("/rooms", method="POST", body=data)
        return room.get("ID") if isinstance(room, dict) else None

    def create_user(self, username):
        data = {"Username": username}
        # backend tests use /user (singular); try that
        user = self.request("/user", method="POST", body=data)
        return user.get("ID") if isinstance(user, dict) else None

    def create_message(self, user_id, room_id, content):
        data = {"UserID": user_id, "RoomID": room_id, "Message": content}
        message = self.request("/messages", method="POST", body=data)
        return (
            message.get("message") == "Message created"
            if isinstance(message, dict)
            else False
        )

    def get_rooms(self):
        return self.request("/rooms", method="GET")

    def get_messages(self, room_id):
        return self.request(f"/messages?RoomID={room_id}", method="GET")

    def change_room(self, room_id, new_name):
        data = {"RoomID": room_id, "Name": new_name}
        room = self.request(f"/rooms", method="PATCH", body=data)
        return room.get("ID") if isinstance(room, dict) else None

    # additional endpoints used by tests
    def get_users(self):
        return self.request("/user", method="GET")

    def get_user(self, user_id):
        return self.request(f"/user?UserID={user_id}", method="GET")

    def change_user(self, user_id, new_name):
        data = {"UserID": user_id, "Name": new_name}
        return self.request("/user", method="PATCH", body=data)

    def delete_room(self, room_id):
        return self.request("/rooms", method="DELETE", body={"RoomID": room_id})

    def delete_user(self, user_id):
        return self.request("/user", method="DELETE", body={"UserID": user_id})

    def delete_message(self, message_id):
        return self.request(
            "/messages", method="DELETE", body={"MessageID": message_id}
        )

    def post_readconfirmation(self, message_id, user_id):
        data = {"MessageID": message_id, "UserID": user_id}
        return self.request("/readconfirmation", method="POST", body=data)

    def get_readconfirmation(self, message_id):
        return self.request(f"/readconfirmation?MessageID={message_id}", method="GET")


def main(serverPort, apiKey, apiUrl):

    serverSocket = socket(AF_INET, SOCK_STREAM)

    serverSocket.bind(("", serverPort))
    serverSocket.listen(1)
    print("Server is running on port", serverPort)

    dbClient = DatabaseClient(apiUrl, apiKey)
    rooms = dbClient.get_rooms()
    print("Available rooms from database:", rooms)

    while True:
        connectionSocket, addr = serverSocket.accept()

        message = connectionSocket.recv(1024).decode()
        responseMessage = message.upper()
        connectionSocket.send(responseMessage.encode())
        connectionSocket.close()
        try:
            continue
        except KeyboardInterrupt:
            print("Keyboard interrupt received, shutting down.")
            serverSocket.close()
            break

    serverSocket.close()
    print("Server shut down.")


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

    SHELLO_API_URL = os.getenv("SHELLO_API_URL")
    if not SHELLO_API_URL:
        print("Warning: SHELLO_API_URL not set in environment")

    serverPort = 12000
    testDatabaseAPI(SHELLO_API_KEY, SHELLO_API_URL)
    # main(serverPort, SHELLO_API_KEY, SHELLO_API_URL)
