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
        if method == "GET":
            r = requests.get(
                f"{self.api_url+endpoint}", headers={"api-key": self.api_key}
            )
            r.raise_for_status()
            return r.json()
        if method == "POST":
            r = requests.post(
                f"{self.api_url+endpoint}",
                headers={"api-key": self.api_key, "Content-Type": "application/json"},
                json=body,
            )
            r.raise_for_status()  # Might need to parse response message
            return r.json()
        raise ValueError("Unsupported HTTP method: " + method)

    def create_room(self, user_id, room_name):
        data = {"UserID": user_id, "Roomname": room_name}
        room = self.request("/rooms", method="POST", body=data)
        return room.ID

    def create_user(self, username):
        data = {"Username": username}
        user = self.request("/users", method="POST", body=data)
        return user.ID

    def create_message(self, user_id, room_id, content):
        data = {"UserID": user_id, "RoomID": room_id, "Message": content}
        message = self.request("/messages", method="POST", body=data)
        return message.ID

    def get_rooms(self):
        rooms = self.request("/rooms", method="GET")
        return rooms

    def get_messages(self, room_id):
        messages = self.request(f"/messages?RoomID={room_id}", method="GET")
        return messages

    def change_room(self, room_id, new_name):
        data = {"RoomID": room_id, "Name": new_name}
        room = self.request(f"/rooms", method="PATCH", body=data)
        return room.ID


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


if __name__ == "__main__":
    load_dotenv()  # lädt .env aus Projektroot

    SHELLO_API_KEY = os.getenv("SHELLO_API_KEY")
    if not SHELLO_API_KEY:
        print("Warning: SHELLO_API_KEY not set in environment")

    SHELLO_API_URL = os.getenv("SHELLO_API_URL")
    if not SHELLO_API_URL:
        print("Warning: SHELLO_API_URL not set in environment")

    serverPort = 12000
    main(serverPort, SHELLO_API_KEY, SHELLO_API_URL)
