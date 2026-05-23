import asyncio
import pytest
import app.auth
from app.main import read_root, post_telemetry_endpoint, TelemetryPayload
from app.auth import get_current_user
from fastapi.security import HTTPAuthorizationCredentials
from fastapi import HTTPException

def test_health_check():
    """Verify health controller logic executes cleanly."""
    response = read_root()
    assert response["status"] == "online"
    assert response["service"] == "astracrowd-core"
    assert "guards_online" in response

def test_telemetry_post_handler():
    """Verify that the telemetry post route updates database states correctly."""
    payload = TelemetryPayload(
        gate_id="Gate_1",
        density_percentage=42.5,
        timestamp="2026-05-23T12:22:00.000Z"
    )
    response = asyncio.run(post_telemetry_endpoint(payload))
    assert response["status"] == "success"
    assert response["processed_zone"] == "Gate 1"
    assert response["density_percentage"] == 42.5

def test_unauthenticated_firebase_bypass():
    """Verify that credentials helper successfully parses local dev-token bypasses."""
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="dev-token")
    user = asyncio.run(get_current_user(creds))
    assert user["uid"] == "dev-user-123"
    assert user["role"] == "ops_director"

def test_unauthenticated_firebase_failure():
    """Verify that credentials helper rejects invalid tokens with 401 raises when firebase is active."""
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid-token-123")
    
    # Temporarily mock firebase_app to force the validation branch
    original_app = app.auth.firebase_app
    app.auth.firebase_app = object() # Non-None mock object
    
    try:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(get_current_user(creds))
        assert exc.value.status_code == 401
    finally:
        # Restore original state
        app.auth.firebase_app = original_app
