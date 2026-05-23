"""
Integration tests — require a running backend on 127.0.0.1:8000.

Run: uvicorn app.main:app --host 127.0.0.1 --port 8000  (from backend/)
Then: python test_astracrowd.py
"""
import asyncio
import json
import sys
import urllib.parse

import httpx
import websockets

BACKEND_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000"


async def drain_until(ws, expected_type: str, timeout: float = 15.0):
    """Read WebSocket messages until one matches expected_type (skips others)."""
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        remaining = deadline - asyncio.get_event_loop().time()
        msg = await asyncio.wait_for(ws.recv(), timeout=max(0.1, remaining))
        data = json.loads(msg)
        if data.get("type") == expected_type:
            return data
    raise TimeoutError(f"No WebSocket message of type '{expected_type}' within {timeout}s")


async def test_api_status():
    print("\n--- Test 1: Verifying Backend GET / Status ---")
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BACKEND_URL}/", timeout=5.0)
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "online"
        assert body["service"] == "astracrowd-core"
    print("[SUCCESS] Status endpoint verified.")


async def test_dashboard_and_camera_telemetry_flow():
    print("\n--- Test 2: End-to-End Telemetry & Critical Alert ---")
    dashboard_uri = f"{WS_URL}/ws/client"
    zone_encoded = urllib.parse.quote("Gate 3")
    guard_uri = f"{WS_URL}/ws/alerts?token=dev-token&zone={zone_encoded}"

    async with websockets.connect(dashboard_uri) as ws_dashboard, websockets.connect(
        guard_uri
    ) as ws_guard:
        critical_telemetry = {
            "gate_id": "Gate_3",
            "density_percentage": 92.5,
            "timestamp": "2026-05-23T14:00:00Z",
        }

        async with httpx.AsyncClient() as client:
            post_response = await client.post(
                f"{BACKEND_URL}/api/telemetry", json=critical_telemetry, timeout=5.0
            )
            assert post_response.status_code == 201, post_response.text

        dashboard_data = await drain_until(ws_dashboard, "telemetry", timeout=8.0)
        gates = {g["name"]: g for g in dashboard_data["gates"]}
        assert gates["Gate 3"]["capacity"] == 92
        assert gates["Gate 3"]["status"] == "critical"
        print("[SUCCESS] Dashboard telemetry verified.")

        guard_data = await drain_until(ws_guard, "predictive_alert", timeout=8.0)
        assert guard_data["severity"] == "CRITICAL"
        assert guard_data["location"] == "Gate 3"
        print("[SUCCESS] Guard critical alert verified.")


async def test_guard_websocket_connection():
    print("\n--- Test 3: Guard WebSocket Handshake ---")
    token = "dev-token"
    zone = urllib.parse.quote("Gate 3")
    uri = f"{WS_URL}/ws/alerts?token={token}&zone={zone}"

    async with websockets.connect(uri) as ws:
        alert = await drain_until(ws, "predictive_alert", timeout=15.0)
        assert alert["type"] == "predictive_alert"
        assert alert["location"] == "Gate 3"
    print("[SUCCESS] Guard received targeted predictive alert.")


async def run_all_tests():
    print("==================================================")
    print("   ASTRACROWD AI - INTEGRATION TESTS              ")
    print("==================================================")
    failures = 0
    for test_fn in (test_api_status, test_dashboard_and_camera_telemetry_flow, test_guard_websocket_connection):
        try:
            await test_fn()
        except Exception as exc:
            failures += 1
            print(f"[FAILED] {test_fn.__name__}: {exc}")
    print("\n==================================================")
    if failures:
        print(f"   {failures} TEST(S) FAILED                               ")
        print("==================================================")
        sys.exit(1)
    print("   ALL INTEGRATION TESTS PASSED                   ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_all_tests())
