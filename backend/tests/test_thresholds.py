"""Unit tests for shared density threshold logic."""
from app.thresholds import (
    classify_status,
    is_critical,
    is_congested_for_routing,
    normalize_gate_id,
    WARNING_MIN_PCT,
    CRITICAL_MIN_PCT,
)


def test_normalize_gate_id():
    assert normalize_gate_id("Gate_3") == "Gate 3"
    assert normalize_gate_id("Gate 3") == "Gate 3"


def test_classify_status_boundaries():
    assert classify_status(WARNING_MIN_PCT - 1) == "safe"
    assert classify_status(WARNING_MIN_PCT) == "warning"
    assert classify_status(CRITICAL_MIN_PCT - 1) == "warning"
    assert classify_status(CRITICAL_MIN_PCT) == "critical"
    assert classify_status(100) == "critical"


def test_is_critical_and_routing_align():
    assert not is_critical(84.9)
    assert is_critical(85.0)
    assert is_congested_for_routing(85.0) == is_critical(85.0)
