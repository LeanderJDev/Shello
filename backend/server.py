"""
The Chat server of our project

it uses WebSockets to communicate with the client

the messages are forwarded to the database REST API
"""

import os
from socket import *
from dotenv import load_dotenv
from database import DatabaseClient


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
