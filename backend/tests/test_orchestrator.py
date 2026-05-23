import pytest
from app.orchestrator import GeminiOrchestrator

def test_orchestrator_normal_state():
    """Verify that when no gates are congested, normal flow signals are generated."""
    orchestrator = GeminiOrchestrator(api_key="mock-api-key")
    
    # Mock normal gate state inputs
    mock_metrics = [
        {"name": "Gate 1", "capacity": 25},
        {"name": "Gate 2", "capacity": 45}
    ]
    
    result = orchestrator.generate_routing_recommendation(mock_metrics)
    
    # Assert correct JSON response format matching frontend requirements
    assert "recommendation_id" in result
    assert "timestamp" in result
    assert result["action"] == "NORMAL"
    assert result["source_gate"] == ""
    assert result["suggested_target_gate"] == ""
    assert result["confidence_score"] == 1.0
    assert "reasoning" in result

def test_orchestrator_congested_state():
    """Verify that when congestion is detected, divert signals are produced."""
    orchestrator = GeminiOrchestrator(api_key="mock-api-key")
    
    # Mock critical gate state inputs (Gate 3 is over 80% limit)
    mock_metrics = [
        {"name": "Gate 1", "capacity": 25},
        {"name": "Gate 3", "capacity": 92}
    ]
    
    result = orchestrator.generate_routing_recommendation(mock_metrics)
    
    assert "recommendation_id" in result
    assert "timestamp" in result
    assert result["action"] == "DIVERT"
    assert result["source_gate"] == "Gate 3"
    assert result["suggested_target_gate"] == "Gate 4"
    assert result["confidence_score"] >= 0.9
    assert "reasoning" in result
    assert "Gate 3" in result["reasoning"]
