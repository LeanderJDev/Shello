import os
import requests
import json
import sys
import time
import statistics
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()
BASE_URL = os.getenv("SHELLO_API_URL")
API_KEY = os.getenv("SHELLO_API_KEY")
HEADERS = {"api-key": API_KEY, "Content-Type": "application/json"}
TIMEOUT = 60  # seconds

# Liste um alle Messungen zu sammeln
timings = []  # each entry: dict(method, path, status, elapsed_ms)


def try_request(
    method: str,
    path: str,
    params: Dict[str, Any] = None,
    json_body: Dict[str, Any] = None,
):
    url = BASE_URL.rstrip("/") + "/" + path.lstrip("/")
    start = time.perf_counter()
    try:
        resp = requests.request(
            method, url, headers=HEADERS, params=params, json=json_body, timeout=TIMEOUT
        )
        status = resp.status_code
        try:
            body = resp.json()
        except Exception:
            body = resp.text
    except Exception as e:
        status = None
        body = f"exception: {e}"
        resp = None
    elapsed = (time.perf_counter() - start) * 1000.0  # ms
    # record timing
    timings.append(
        {
            "method": method,
            "path": path,
            "params": params,
            "json": json_body,
            "status": status,
            "elapsed_ms": elapsed,
        }
    )
    print()
    print(
        f"[{status}] {method} {url} params={params} json={json_body} -> {body}  ({elapsed:.0f} ms)"
    )
    return resp, body


def print_summary():
    if not timings:
        print("No requests recorded.")
        return
    # aggregate by method + path
    agg = {}
    success_map = {}
    for t in timings:
        key = f"{t['method']} {t['path']}"
        agg.setdefault(key, []).append(t["elapsed_ms"])
        ok = 1 if (isinstance(t.get("status"), int) and 200 <= t["status"] < 300) else 0
        success_map.setdefault(key, []).append(ok)

    print("\nSummary per endpoint:")
    print(
        f"{'Endpoint':<40} {'count':>5} {'succ%':>7} {'succ/fail':>10} {'avg(ms)':>10} {'min(ms)':>10} {'max(ms)':>10}"
    )
    for key, vals in sorted(agg.items()):
        count = len(vals)
        succs = sum(success_map.get(key, []))
        fails = count - succs
        success_rate = (succs / count) * 100 if count else 0.0
        avg = statistics.mean(vals)
        mn = min(vals)
        mx = max(vals)
        print(
            f"{key:<40} {count:5d} {success_rate:7.1f}% {succs:5d}/{fails:<4d} {avg:10.1f} {mn:10.1f} {mx:10.1f}"
        )

    # optional overall stats
    all_vals = [t["elapsed_ms"] for t in timings]
    total_requests = len(all_vals)
    total_success = sum(
        1
        for t in timings
        if isinstance(t.get("status"), int) and 200 <= t["status"] < 300
    )
    total_fail = total_requests - total_success
    print("\nOverall:")
    print(
        f"requests: {total_requests}, success: {total_success}, fail: {total_fail}, avg: {statistics.mean(all_vals):.1f} ms, min: {min(all_vals):.1f} ms, max: {max(all_vals):.1f} ms"
    )


def main():
    # 0) quick health: GET /rooms (exists in many implementations)
    resp, body = try_request("GET", "rooms")
    # 1) create user
    resp, body = try_request(
        "POST", "user", json_body={"Username": "IntegrationTestUser"}
    )
    if not resp or resp.status_code not in (200, 201):
        print("Failed to create user, aborting further tests.")
        print_summary()
        sys.exit(1)
    user_id = body.get("ID") if isinstance(body, dict) else None
    print("user_id:", user_id)

    # 2) create room
    resp, body = try_request(
        "POST",
        "rooms",
        json_body={"Roomname": "IntegrationTestRoom", "UserID": user_id},
    )
    if not resp or resp.status_code not in (200, 201):
        print("Failed to create room, aborting further tests.")
        print_summary()
        sys.exit(1)
    room_id = body.get("ID") if isinstance(body, dict) else None
    print("room_id:", room_id)

    # 3) get rooms
    try_request("GET", "rooms")

    # 4) post a message
    resp, body = try_request(
        "POST",
        "messages",
        json_body={
            "Message": "Hello from integration test",
            "RoomID": room_id,
            "UserID": user_id,
        },
    )
    if not resp or resp.status_code not in (200, 201):
        print("Failed to post message.")
    message_created = None
    if isinstance(body, dict) and "message" in body:
        message_created = True
    # 5) fetch messages for room
    resp, body = try_request("GET", "messages", params={"RoomID": room_id})
    message_list = body if isinstance(body, list) else []
    print("messages fetched:", len(message_list))
    print("message_list:", message_list)

    # Try endpoints referenced by Bruno files beyond basics:
    # 6) change room name (PATCH /rooms)
    try_request(
        "PATCH",
        "rooms",
        json_body={"RoomID": room_id, "Name": "Renamed Integration Room"},
    )

    # 7) fetch messages with R=1 style (try RoomID=1 also)
    try_request("GET", "messages", params={"RoomID": 1})

    # 8) readconfirmation endpoints (best-effort guesses)
    # try POST /readconfirmation and GET /readconfirmation
    try_request(
        "POST",
        "readconfirmation",
        json_body={
            "MessageID": (
                message_list[0]["MessageID"]
                if message_list
                and isinstance(message_list[0], dict)
                and "MessageID" in message_list[0]
                else None
            ),
            "UserID": user_id,
        },
    )
    try_request(
        "GET",
        "readconfirmation",
        params={
            "MessageID": (
                message_list[0]["MessageID"]
                if message_list
                and isinstance(message_list[0], dict)
                and "MessageID" in message_list[0]
                else None
            )
        },
    )

    # 9) fetch users (try both /user and /users)
    try_request("GET", "user")

    # 10) change user (PATCH /user)
    try_request(
        "PATCH", "user", json_body={"UserID": user_id, "Name": "RenamedTestUser"}
    )

    # 11) delete message (try DELETE /messages and DELETE /messages/:id)
    # try to find a message id from fetched messages
    msg_id = None
    if message_list and isinstance(message_list[0], dict):
        msg = message_list[0]
        msg_id = msg.get("ID") or msg.get("id") or msg.get("MessageID")
    if msg_id:
        try_request("DELETE", f"messages", json_body={"MessageID": msg_id})

    # 12) delete room
    if room_id:
        try_request("DELETE", "rooms", json_body={"RoomID": room_id})

    # 13) delete user
    if user_id:
        try_request("DELETE", "user", json_body={"UserID": user_id})

    print(
        "\nIntegration tests finished. Review above responses to see which endpoints are implemented."
    )
    print_summary()


if __name__ == "__main__":
    main()


"""
Test 10.12.2025:
Summary per endpoint:
Endpoint                                 count   succ%  succ/fail    avg(ms)    min(ms)    max(ms)
DELETE messages                              1   100.0%     1/0         367.7      367.7      367.7
DELETE rooms                                 1   100.0%     1/0         400.0      400.0      400.0
DELETE user                                  1   100.0%     1/0         337.4      337.4      337.4
GET messages                                 2   100.0%     2/0         790.8      369.0     1212.6
GET readconfirmation                         1   100.0%     1/0         806.6      806.6      806.6
GET rooms                                    2   100.0%     2/0         362.5      328.0      396.9
GET user                                     1   100.0%     1/0         328.9      328.9      328.9
PATCH rooms                                  1   100.0%     1/0         391.2      391.2      391.2
PATCH user                                   1   100.0%     1/0        1218.0     1218.0     1218.0
POST messages                                1   100.0%     1/0         347.1      347.1      347.1
POST readconfirmation                        1   100.0%     1/0         349.8      349.8      349.8
POST rooms                                   1   100.0%     1/0         996.8      996.8      996.8
POST user                                    1   100.0%     1/0         361.1      361.1      361.1

Overall:
requests: 15, success: 15, fail: 0, avg: 547.4 ms, min: 328.0 ms, max: 1218.0 ms

"""
