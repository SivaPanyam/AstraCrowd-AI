import asyncio
import json
import os
import random
import time
from typing import Dict, List, Any
from contextlib import asynccontextmanager
from collections import defaultdict

from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from app.auth import get_current_user, verify_firebase_token
from app.websockets import GuardConnectionManager, EdgeConnectionManager
from app.logging_setup import logger
from app.thresholds import (
    classify_status,
    is_critical,
    normalize_gate_id,
    UNDERUTILIZED_MAX_PCT,
    CRITICAL_MIN_PCT,
)

# In-memory sliding-window telemetry rate limiter database
telemetry_rate_limit_db = defaultdict(list)
RATE_LIMIT_MAX_REQUESTS = 10  # Max 10 requests per 2 seconds
RATE_LIMIT_WINDOW_SECONDS = 2.0

async def rate_limit_telemetry(request: Request):
    """
    In-memory sliding-window rate limiter protecting `/api/telemetry` from edge DDoS.
    """
    client_ip = request.client.host if request.client else "unknown_edge_node"
    now = time.time()
    
    # Prune old timestamps
    timestamps = telemetry_rate_limit_db[client_ip]
    telemetry_rate_limit_db[client_ip] = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW_SECONDS]
    
    if len(telemetry_rate_limit_db[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
        logger.error(
            f"Rate limit exceeded: DDoS behavior guarded from IP {client_ip}. Requests within window: {len(telemetry_rate_limit_db[client_ip])}"
        )
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Telemetry ingestion rate limit reached."
        )
    
    telemetry_rate_limit_db[client_ip].append(now)

# Instantiate connection managers
guard_manager = GuardConnectionManager()
edge_manager = EdgeConnectionManager()

# Temporary operational database
gates_db = [
    {"name": "Gate 1", "flowRate": 38, "waitTime": 3, "capacity": 25, "status": "safe", "type": "General"},
    {"name": "Gate 2", "flowRate": 55, "waitTime": 7, "capacity": 48, "status": "safe", "type": "General"},
    {"name": "Gate 3", "flowRate": 122, "waitTime": 24, "capacity": 94, "status": "critical", "type": "General"},
    {"name": "Gate 4", "flowRate": 18, "waitTime": 2, "capacity": 10, "status": "safe", "type": "VIP"}
]


# =====================================================================
# BACKGROUND PREDICTIVE TASK
# =====================================================================

async def congestion_predictor_task():
    """
    Asynchronous background loop simulating real-time crowd dynamics evaluation.
    Predicts congestion at 'Gate 3' and broadcasts a warning JSON payload 
    ONLY to guards stationed in 'Gate 3' or 'CommandCenter'.
    """
    logger.info("[PREDICTOR] Ingress Congestion Predictor Worker active.")
    while True:
        try:
            await asyncio.sleep(10)  # Evaluate camera feeds every 10 seconds
            
            # Generate simulated congestion alert warning
            alert_payload = {
                "type": "predictive_alert",
                "timestamp": time.time(),
                "location": "Gate 3",
                "severity": "CRITICAL",
                "message": "CONGESTION ALERT: Computer vision analytics predict capacity breach (95%+) at Gate 3 entryways. Deploy bypass protocols.",
                "predicted_capacity_pct": 95,
                "target_responders": ["Gate 3", "CommandCenter"]
            }
            
            # Broadcast ONLY to guards in the specific zones
            await guard_manager.broadcast_to_zone(["Gate 3", "CommandCenter"], alert_payload)
            
        except asyncio.CancelledError:
            logger.info("[PREDICTOR] Worker shutting down cleanly.")
            break
        except Exception as e:
            logger.error(f"[PREDICTOR ERROR] Service encountered anomaly: {e}")
            await asyncio.sleep(5)


# Lifespan Context Manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Launch background predictor task
    predictor_worker = asyncio.create_task(congestion_predictor_task())
    yield
    # Shutdown: Clean up background tasks
    predictor_worker.cancel()
    try:
        await predictor_worker
    except asyncio.CancelledError:
        pass


# =====================================================================
# FASTAPI INSTANCE & ROUTING
# =====================================================================

app = FastAPI(
    title="AstraCrowd AI - Real-time Routing & Authentication Backend",
    description="Implements secure WebSocket telemetry and guard routing maps with Firebase Authentication.",
    version="1.1.0",
    lifespan=lifespan
)

# CORS configurations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    """Liveness probe for Docker / load balancers (proxied at /health)."""
    return {
        "status": "online",
        "service": "astracrowd-core",
        "guards_online": len(guard_manager.active_guards),
        "cv_nodes_online": len(edge_manager.active_edge_nodes),
    }


@app.get("/")
def read_root():
    return health_check()


# =====================================================================
# REST API (all routes under /api/* — proxied by nginx on Cloud Run)
# =====================================================================

@app.get("/api")
def api_catalog():
    """API index — verify deploy exposed all routes."""
    return {
        "service": "astracrowd-core",
        "version": "1.2.0",
        "endpoints": {
            "GET /api": "This catalog",
            "GET /api/status": "Health + connection counts",
            "GET /api/gates": "Live gate telemetry snapshot",
            "POST /api/telemetry": "Edge camera / CV density ingest",
            "POST /api/chat": "AI copilot (Authorization: Bearer)",
            "GET /health": "Liveness probe",
            "GET /docs": "Swagger UI",
            "WS /ws/client": "Dashboard stream",
            "WS /ws/alerts": "Guard alerts (?token=&zone=)",
            "WS /ws/edge/{node_id}": "Edge CV nodes",
        },
    }


@app.get("/api/status")
def api_status():
    return {
        "status": "online",
        "service": "astracrowd-core",
        "guards_online": len(guard_manager.active_guards),
        "cv_nodes_online": len(edge_manager.active_edge_nodes),
        "dashboard_clients": len(edge_manager.active_clients),
        "allow_demo_auth": os.getenv("ALLOW_DEMO_AUTH", "false"),
    }


@app.get("/api/gates")
def api_gates():
    """Current gate metrics for dashboard initial load."""
    return {
        "type": "telemetry",
        "gates": gates_db,
        "totalCapacity": sum(g["flowRate"] * 4 for g in gates_db),
        "avgWaitTime": sum(g["waitTime"] for g in gates_db) / len(gates_db) if gates_db else 0,
        "timestamp": time.time(),
    }


from pydantic import BaseModel, field_validator

class TelemetryPayload(BaseModel):
    gate_id: str
    density_percentage: float
    timestamp: str  # ISO-8601 string

    @field_validator("gate_id")
    @classmethod
    def gate_id_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("gate_id must not be empty")
        return v.strip()

    @field_validator("density_percentage")
    @classmethod
    def density_in_range(cls, v: float) -> float:
        if v < 0 or v > 100:
            raise ValueError("density_percentage must be between 0 and 100")
        return v

@app.post("/api/telemetry", status_code=201)
async def post_telemetry_endpoint(payload: TelemetryPayload, request: Request = None, _ = Depends(rate_limit_telemetry)):
    """
    Receives JSON telemetry from edge-cv node detectors and broadcasts
    calculated crowd flow rates and congestion warnings to connected dashboards.
    """
    zone = normalize_gate_id(payload.gate_id)
    density = payload.density_percentage
    logger.info(f"[API TELEMETRY] Inflow registered from {zone}: Density={density}%")
    
    # Dynamically update the local gates database to match live edge counts
    gate_found = False
    status = classify_status(density)
    for gate in gates_db:
        if gate["name"] == zone:
            gate_found = True
            gate["capacity"] = int(density)
            gate["flowRate"] = int(density * 1.3)
            gate["waitTime"] = int(density * 0.22)
            gate["status"] = status
            break
            
    # If a new camera zone was detected, dynamically append to db
    if not gate_found:
        new_gate = {
            "name": zone,
            "flowRate": int(density * 1.3),
            "waitTime": int(density * 0.22),
            "capacity": int(density),
            "status": status,
            "type": "General"
        }
        gates_db.append(new_gate)
        
    # Construct unified operational dashboard update payload
    dashboard_update = {
        "type": "telemetry",
        "totalCapacity": sum(g["flowRate"] * 4 for g in gates_db),
        "avgWaitTime": sum(g["waitTime"] for g in gates_db) / len(gates_db),
        "gates": gates_db
    }
    
    # Broadcast to all live operational dashboard panels (WebSocket)
    await edge_manager.broadcast_to_clients(dashboard_update)
    
    # If the capacity is critical, dispatch predictive alert warning to guards in the zone too!
    if is_critical(density):
        critical_guard_alert = {
            "type": "predictive_alert",
            "timestamp": payload.timestamp,
            "location": zone,
            "severity": "CRITICAL",
            "message": f"CONGESTION ALERT: YOLOv8 edge parsing registered capacity breach ({density}%) at {zone} entrance zones. Dispatching reinforcement guards.",
            "predicted_capacity_pct": int(density),
            "target_responders": [zone, "CommandCenter"]
        }
        await guard_manager.broadcast_to_zone([zone, "CommandCenter"], critical_guard_alert)
        
    return {"status": "success", "processed_zone": zone, "density_percentage": density}

class ChatRequest(BaseModel):
    prompt: str

@app.post("/api/chat")
async def chat_endpoint(payload: ChatRequest, user: dict = Depends(get_current_user)):
    """
    Context-aware AI Security Assistant endpoint evaluating real-time stadium gate metrics.
    Calls Gemini 2.5 Flash using the official google-genai SDK.
    """
    # Create system context containing real-time stadium operational state
    system_instruction = f"""
    You are AstraCrowd AI, the Stadium Security and Operations assistant.
    Your task is to analyze stadium gate telemetry and answer queries from the command center staff.
    
    Current Stadium Gates Metrics:
    {json.dumps(gates_db, indent=2)}
    
    Provide clear, professional, concise, and highly operational answers based ONLY on the actual live metrics provided above. Highlight critical anomalies, queue bottlenecks, or under-utilized gates immediately.
    """
    
    api_key = os.getenv("GEMINI_API_KEY")
    
    # Elegant fallback for developer offline/sandbox prototyping
    if not api_key:
        logger.warning("[GEMINI] API Key missing. Generating rich sandbox operational report...")
        return {
            "response": generate_mock_gemini_report(payload.prompt)
        }
        
    try:
        from google import genai
        from google.genai import types
        
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=payload.prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.2
            )
        )
        return {"response": response.text}
    except ImportError:
        logger.warning("[GEMINI] google-genai SDK not available. Using dynamic local fallback...")
        return {"response": generate_mock_gemini_report(payload.prompt)}
    except Exception as e:
        logger.error(f"[GEMINI ERROR] Generation failed: {e}")
        return {
            "response": f"[FALLBACK ERROR RESPONSE] Operational assistant could not process prompts dynamically: {e}.\nLive Gate metrics: Gate 3 capacity at {gates_db[2]['capacity']}%."
        }

def generate_mock_gemini_report(prompt: str) -> str:
    """Simulates high-fidelity context-aware AI outputs for local testing."""
    prompt_lower = prompt.lower()
    
    if "under-utilized" in prompt_lower or "underutilized" in prompt_lower or "low" in prompt_lower:
        underutilized = [g["name"] for g in gates_db if g["capacity"] < UNDERUTILIZED_MAX_PCT]
        return f"[ASTRACROWD AI SECURE REPORT]\n\nBased on current stadium telemetry, the following gates are currently under-utilized:\n" + \
               "\n".join([f"- {g['name']} (Capacity: {g['capacity']}% | Type: {g['type']})" for g in gates_db if g['name'] in underutilized]) + \
               "\n\nSuggested Action: Operations can redirect pedestrian flows to these sectors to balance stadium density."
               
    if "bottleneck" in prompt_lower or "critical" in prompt_lower or "congest" in prompt_lower:
        congested = [g["name"] for g in gates_db if g["capacity"] >= CRITICAL_MIN_PCT]
        return f"[ASTRACROWD AI CRITICAL WARNING]\n\nBOTTLENECK DETECTED:\n" + \
               "\n".join([f"- {g['name']} (Capacity: {g['capacity']}%, Wait Time: {g['waitTime']} mins)" for g in gates_db if g['name'] in congested]) + \
               "\n\nSuggested Action: Trigger active redirection signals on digital signage boards to divert ingress crowds to VIP/Club/under-utilized sectors immediately."
               
    # General fallback summary
    return f"[ASTRACROWD AI OPS REPORT]\n\nI have evaluated the current operational metrics:\n" + \
           f"- Total Ingress Inflow: {sum(g['flowRate'] for g in gates_db)} persons/min\n" + \
           f"- Average wait threshold: {sum(g['waitTime'] for g in gates_db) / len(gates_db):.1f} minutes\n" + \
           f"- Critical Zone: {[g['name'] for g in gates_db if g['status'] == 'critical']}\n\n" + \
           f"Security teams should maintain gate diversion parameters."

# =====================================================================
# WEBSOCKET SECURED ENDPOINTS
# =====================================================================

@app.websocket("/ws/alerts")
async def websocket_alerts_endpoint(
    websocket: WebSocket,
    token: str = Query(None),
    zone: str = Query(None)  # Development override query parameter
):
    """
    Protected WebSocket endpoint for Stadium Security Guards.
    Validates Firebase Token, maps connection by guard zone, and streams target alerts.
    """
    # 1. AUTHENTICATE ID TOKEN
    claims = await verify_firebase_token(websocket, token)
    if not claims:
        # Rejection already processed in verify_firebase_token
        return
        
    uid = claims.get("uid")
    name = claims.get("name", f"Guard-{uid[:4]}")
    
    # 2. EXTRACT ZONE MAPPING (Claims, fallback to query param or default CommandCenter)
    guard_zone = claims.get("zone") or zone or "CommandCenter"
    guard_zone = guard_zone.replace("_", " ")
    
    # 3. REGISTER IN GUARD MANAGER
    await guard_manager.connect(uid, guard_zone, name, websocket)
    
    try:
        # Stream telemetry heartbeat, receive client acknowledgments
        while True:
            # Maintain active connection, listening for incoming status updates from guards
            data = await websocket.receive_text()
            logger.info(f"[WS GUARD ALERT] Msg from {name} ({uid}): {data}")
            
    except WebSocketDisconnect:
        guard_manager.disconnect(uid)
    except Exception as e:
        logger.error(f"[WS GUARD ERROR] Exception with {name}: {e}")
        guard_manager.disconnect(uid)


@app.websocket("/ws/client")
async def websocket_dashboard_endpoint(websocket: WebSocket):
    """WebSocket channel for live telemetry operational dashboards."""
    await edge_manager.connect_client(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        edge_manager.disconnect_client(websocket)


@app.websocket("/ws/edge/{node_id}")
async def websocket_edge_endpoint(websocket: WebSocket, node_id: str):
    """WebSocket channel for edge CV camera ingestion nodes."""
    await edge_manager.register_edge_node(node_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await edge_manager.broadcast_to_clients({
                "type": "telemetry",
                "source_node": node_id,
                "data": data
            })
    except WebSocketDisconnect:
        edge_manager.disconnect_edge_node(node_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
