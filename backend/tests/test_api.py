import asyncio
import pytest
import app.auth as auth_module
from pydantic import ValidationError
from httpx import ASGITransport, AsyncClient

from app.main import (
    app as fastapi_app,
    read_root,
    post_telemetry_endpoint,
    TelemetryPayload,
    chat_endpoint,
    ChatRequest,
    gates_db,
)
from app.auth import get_current_user
from app.thresholds import WARNING_MIN_PCT, CRITICAL_MIN_PCT
from fastapi.security import HTTPAuthorizationCredentials
from fastapi import HTTPException


def test_health_check():
    response = read_root()
    assert response["status"] == "online"
    assert response["service"] == "astracrowd-core"
    assert "guards_online" in response


def test_telemetry_post_handler_updates_gate():
    payload = TelemetryPayload(
        gate_id="Gate_1",
        density_percentage=65.0,
        timestamp="2026-05-23T12:22:00.000Z",
    )
    response = asyncio.run(post_telemetry_endpoint(payload))
    assert response["status"] == "success"
    assert response["processed_zone"] == "Gate 1"

    gate_1 = next(g for g in gates_db if g["name"] == "Gate 1")
    assert gate_1["capacity"] == 65
    assert gate_1["status"] == "warning"


def test_telemetry_critical_status_and_zone_normalize():
    payload = TelemetryPayload(
        gate_id="Gate_3",
        density_percentage=92.5,
        timestamp="2026-05-23T14:00:00Z",
    )
    response = asyncio.run(post_telemetry_endpoint(payload))
    assert response["processed_zone"] == "Gate 3"
    gate_3 = next(g for g in gates_db if g["name"] == "Gate 3")
    assert gate_3["capacity"] == 92
    assert gate_3["status"] == "critical"


def test_telemetry_invalid_density_rejected():
    with pytest.raises(ValidationError):
        TelemetryPayload(
            gate_id="Gate_1",
            density_percentage=150.0,
            timestamp="2026-05-23T12:00:00Z",
        )


def test_telemetry_empty_gate_id_rejected():
    with pytest.raises(ValidationError):
        TelemetryPayload(
            gate_id="  ",
            density_percentage=50.0,
            timestamp="2026-05-23T12:00:00Z",
        )


def test_telemetry_http_validation_error():
    async def _post():
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post(
                "/api/telemetry",
                json={
                    "gate_id": "Gate_1",
                    "density_percentage": -5,
                    "timestamp": "2026-05-23T12:00:00Z",
                },
            )

    response = asyncio.run(_post())
    assert response.status_code == 422


def test_unauthenticated_firebase_bypass():
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="dev-token")
    user = asyncio.run(get_current_user(creds))
    assert user["uid"] == "dev-user-123"
    assert user["role"] == "ops_director"


def test_unauthenticated_firebase_failure():
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid-token-123")
    original_app = auth_module.firebase_app
    auth_module.firebase_app = object()
    try:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(get_current_user(creds))
        assert exc.value.status_code == 401
    finally:
        auth_module.firebase_app = original_app


def test_production_blocks_dev_token(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="dev-token")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user(creds))
    assert exc.value.status_code == 403
    monkeypatch.delenv("ENVIRONMENT", raising=False)


def test_chat_handler_dev(force_mock_gemini):
    payload = ChatRequest(prompt="Which gates are currently under-utilized?")
    mock_user = {"uid": "ops-director", "role": "ops_director"}
    response = asyncio.run(chat_endpoint(payload, mock_user))
    assert "response" in response
    assert "[ASTRACROWD AI" in response["response"]


def test_telemetry_rate_limiting():
    from app.main import rate_limit_telemetry, telemetry_rate_limit_db
    from fastapi import Request
    from unittest.mock import Mock

    mock_request = Mock(spec=Request)
    mock_request.client = Mock()
    mock_request.client.host = "test-rate-limit-host"

    telemetry_rate_limit_db.clear()

    for _ in range(10):
        asyncio.run(rate_limit_telemetry(mock_request))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(rate_limit_telemetry(mock_request))
    assert exc.value.status_code == 429
    assert "Rate limit" in exc.value.detail
