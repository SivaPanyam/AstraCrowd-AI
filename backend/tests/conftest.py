"""Pytest fixtures: reset shared in-memory state between tests."""
import copy
import pytest

from app.main import gates_db, telemetry_rate_limit_db

DEFAULT_GATES_DB = [
    {"name": "Gate 1", "flowRate": 38, "waitTime": 3, "capacity": 25, "status": "safe", "type": "General"},
    {"name": "Gate 2", "flowRate": 55, "waitTime": 7, "capacity": 48, "status": "safe", "type": "General"},
    {"name": "Gate 3", "flowRate": 122, "waitTime": 24, "capacity": 94, "status": "critical", "type": "General"},
    {"name": "Gate 4", "flowRate": 18, "waitTime": 2, "capacity": 10, "status": "safe", "type": "VIP"},
]


@pytest.fixture(autouse=True)
def reset_operational_state():
    gates_db.clear()
    gates_db.extend(copy.deepcopy(DEFAULT_GATES_DB))
    telemetry_rate_limit_db.clear()
    yield
    gates_db.clear()
    gates_db.extend(copy.deepcopy(DEFAULT_GATES_DB))
    telemetry_rate_limit_db.clear()


@pytest.fixture
def force_mock_gemini(monkeypatch):
    """Ensure chat tests always use the local mock reporter, not live Gemini."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
