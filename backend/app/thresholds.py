"""
Crowd density thresholds — single source of truth (see DESIGN.md).

- safe:      capacity < 60%
- warning:   60% <= capacity < 85%
- critical:  capacity >= 85%
"""

WARNING_MIN_PCT = 60.0
CRITICAL_MIN_PCT = 85.0
UNDERUTILIZED_MAX_PCT = 50.0


def normalize_gate_id(gate_id: str) -> str:
    return gate_id.replace("_", " ").strip()


def classify_status(capacity: float) -> str:
    if capacity >= CRITICAL_MIN_PCT:
        return "critical"
    if capacity >= WARNING_MIN_PCT:
        return "warning"
    return "safe"


def is_critical(capacity: float) -> bool:
    return capacity >= CRITICAL_MIN_PCT


def is_congested_for_routing(capacity: float) -> bool:
    return capacity >= CRITICAL_MIN_PCT
