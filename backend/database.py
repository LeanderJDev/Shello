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

    # Convenience helpers used by the WebSocket server for lookups
    def get_user_by_name(self, username: str):
        users = self.get_users()
        if not users:
            return {"error": "user not found"}
        # users may be a list of dicts
        for u in users:
            if not isinstance(u, dict):
                continue
            name = u.get("Name") or u.get("Username") or u.get("username")
            uid = u.get("ID") or u.get("id") or u.get("UserID") or u.get("user_id")
            if name == username:
                return {"user_id": uid, "username": name}
        return {"error": "user not found"}

    def get_user_by_ID(self, user_id):
        users = self.get_users()
        if not users:
            return {"error": "user not found"}
        for u in users:
            if not isinstance(u, dict):
                continue
            uid = u.get("ID") or u.get("id") or u.get("UserID") or u.get("user_id")
            name = u.get("Name") or u.get("Username") or u.get("username")
            # compare as int when possible
            try:
                if uid is not None and int(uid) == int(user_id):
                    return {"user_id": uid, "username": name}
            except Exception:
                # fallback to string comparison
                if str(uid) == str(user_id):
                    return {"user_id": uid, "username": name}
        return {"error": "user not found"}
