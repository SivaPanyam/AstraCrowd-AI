import pytest
from app.orchestrator import GeminiOrchestrator
from app.thresholds import CRITICAL_MIN_PCT, WARNING_MIN_PCT


def test_orchestrator_normal_state():
    orchestrator = GeminiOrchestrator(api_key="mock-api-key")
    mock_metrics = [
        {"name": "Gate 1", "capacity": 25},
        {"name": "Gate 2", "capacity": 45},
    ]
    result = orchestrator.generate_routing_recommendation(mock_metrics)
    assert result["action"] == "NORMAL"
    assert result["source_gate"] == ""


def test_orchestrator_warning_not_divert():
    """Warning band (60–84%) must not trigger diversion."""
    orchestrator = GeminiOrchestrator(api_key="mock-api-key")
    mock_metrics = [
        {"name": "Gate 1", "capacity": 25},
        {"name": "Gate 2", "capacity": int(WARNING_MIN_PCT + 10)},
    ]
    result = orchestrator.generate_routing_recommendation(mock_metrics)
    assert result["action"] == "NORMAL"


def test_orchestrator_below_critical_not_divert():
    orchestrator = GeminiOrchestrator(api_key="mock-api-key")
    below_critical = int(CRITICAL_MIN_PCT) - 1
    mock_metrics = [{"name": "Gate 3", "capacity": below_critical}]
    result = orchestrator.generate_routing_recommendation(mock_metrics)
    assert result["action"] == "NORMAL"


def test_orchestrator_congested_state():
    orchestrator = GeminiOrchestrator(api_key="mock-api-key")
    mock_metrics = [
        {"name": "Gate 1", "capacity": 25},
        {"name": "Gate 3", "capacity": 92},
    ]
    result = orchestrator.generate_routing_recommendation(mock_metrics)
    assert result["action"] == "DIVERT"
    assert result["source_gate"] == "Gate 3"
    assert result["suggested_target_gate"] == "Gate 4"
    assert result["confidence_score"] >= 0.9
    assert "Gate 3" in result["reasoning"]
