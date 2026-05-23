import asyncio
import json
import os
import random
import time
from typing import Dict, List, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
import firebase_admin
from firebase_admin import credentials, auth

# =====================================================================
# FIREBASE ADMIN SETUP & AUTHENTICATION
# Note: Runtime environment variables (like FIREBASE_SERVICE_ACCOUNT_JSON)
# are injected either via the host OS system shell env or loaded from a
# local .env file by standard backend supervisors at startup.
# =====================================================================

firebase_app = None
try:
    cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if cred_path and os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_app = firebase_admin.initialize_app(cred)
        print("[FIREBASE] Initialized successfully using Certificate.")
    else:
        firebase_app = firebase_admin.initialize_app()
        print("[FIREBASE] Initialized successfully using Default Credentials.")
except Exception as e:
    print(f"[FIREBASE] Warning: Running in DEVELOPER BYPASS mode: {e}")

async def verify_firebase_token(websocket: WebSocket, token: str = Query(None)) -> dict:
    """
    Extracts and verifies the Firebase ID Token from WebSocket query parameter.
    If the token is invalid or missing, rejects the socket connection.
    """
    if not token:
        print("[AUTH] WS Connection rejected: Token query parameter missing.")
        # Reject connection with policy violation status
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Token missing")
        return None
        
    # Local developer bypass mode
    if token == "dev-token" or firebase_app is None:
        print("[AUTH] WS Connection accepted via Developer Bypass.")
        return {
            "uid": "dev-guard-77",
            "name": "Local Guard 77",
            "role": "guard",
            "zone": "Gate 3"  # Mock zone claim
        }
        
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as exc:
        print(f"[AUTH] WS Token verification failed: {exc}")
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return None


# =====================================================================
# STADIUM OPERATIONS CONNECTION MANAGERS
# =====================================================================

class GuardConnectionManager:
    """
    Connection manager class mapping connected security guards to their
    assigned stadium zones (extracted from Firebase custom claims or overrides).
    """
    def __init__(self):
        # Maps uid -> Dict[str, Any] which contains: "websocket", "zone", "name"
        self.active_guards: Dict[str, Dict[str, Any]] = {}

    async def connect(self, uid: str, zone: str, name: str, websocket: WebSocket):
        """Accept connection and register guard zone mapping."""
        await websocket.accept()
        self.active_guards[uid] = {
            "websocket": websocket,
            "zone": zone,
            "name": name
        }
        print(f"[GUARD MANAGER] Guard '{name}' ({uid}) registered in zone '{zone}'. Total active: {len(self.active_guards)}")

    def disconnect(self, uid: str):
        """Unregister a disconnected guard connection."""
        if uid in self.active_guards:
            name = self.active_guards[uid]["name"]
            del self.active_guards[uid]
            print(f"[GUARD MANAGER] Guard '{name}' ({uid}) disconnected. Remaining: {len(self.active_guards)}")

    async def broadcast_to_zone(self, target_zones: List[str], message: dict):
        """Sends a JSON alert message to guards stationed ONLY in the targeted zones."""
        disconnected_uids = []
        sent_count = 0
        
        for uid, info in self.active_guards.items():
            if info["zone"] in target_zones:
                try:
                    await info["websocket"].send_json(message)
                    sent_count += 1
                except Exception:
                    disconnected_uids.append(uid)
                    
        for uid in disconnected_uids:
            self.disconnect(uid)
            
        if sent_count > 0:
            print(f"[GUARD MANAGER] Transmitted zone alert to {sent_count} guards in: {target_zones}")


class EdgeConnectionManager:
    """Connection manager for edge computer vision (YOLOv8) nodes."""
    def __init__(self):
        self.active_clients: List[WebSocket] = []
        self.active_edge_nodes: Dict[str, WebSocket] = {}

    async def connect_client(self, websocket: WebSocket):
        await websocket.accept()
        self.active_clients.append(websocket)
        print(f"[EDGE MANAGER] Dashboard client online. Total: {len(self.active_clients)}")

    def disconnect_client(self, websocket: WebSocket):
        if websocket in self.active_clients:
            self.active_clients.remove(websocket)
            print(f"[EDGE MANAGER] Dashboard client offline. Total: {len(self.active_clients)}")

    async def register_edge_node(self, node_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_edge_nodes[node_id] = websocket
        print(f"[EDGE MANAGER] CV Node '{node_id}' online. Total: {len(self.active_edge_nodes)}")

    def disconnect_edge_node(self, node_id: str):
        if node_id in self.active_edge_nodes:
            del self.active_edge_nodes[node_id]
            print(f"[EDGE MANAGER] CV Node '{node_id}' offline. Total: {len(self.active_edge_nodes)}")

    async def broadcast_to_clients(self, message: dict):
        disconnected = []
        for connection in self.active_clients:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect_client(conn)


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
    print("[PREDICTOR] Ingress Congestion Predictor Worker active.")
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
            print("[PREDICTOR] Worker shutting down cleanly.")
            break
        except Exception as e:
            print(f"[PREDICTOR ERROR] Service encountered anomaly: {e}")
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

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "astracrowd-core",
        "guards_online": len(guard_manager.active_guards),
        "cv_nodes_online": len(edge_manager.active_edge_nodes)
    }

from pydantic import BaseModel

class TelemetryPayload(BaseModel):
    gate_id: str
    density_percentage: float
    timestamp: str  # ISO-8601 string

@app.post("/api/telemetry", status_code=201)
async def post_telemetry_endpoint(payload: TelemetryPayload):
    """
    Receives JSON telemetry from edge-cv node detectors and broadcasts
    calculated crowd flow rates and congestion warnings to connected dashboards.
    """
    # Normalize Gate ID by replacing underscores with spaces (e.g. "Gate_1" to "Gate 1")
    zone = payload.gate_id.replace("_", " ")
    density = payload.density_percentage
    print(f"[API TELEMETRY] Inflow registered from {zone}: Density={density}%")
    
    # Dynamically update the local gates database to match live edge counts
    gate_found = False
    for gate in gates_db:
        if gate["name"] == zone:
            gate_found = True
            gate["capacity"] = int(density)
            gate["flowRate"] = int(density * 1.3)
            gate["waitTime"] = int(density * 0.22)
            
            # Recalibrate status levels
            if density >= 85.0:
                gate["status"] = "critical"
            elif density >= 60.0:
                gate["status"] = "warning"
            else:
                gate["status"] = "safe"
            break
            
    # If a new camera zone was detected, dynamically append to db
    if not gate_found:
        new_gate = {
            "name": zone,
            "flowRate": int(density * 1.3),
            "waitTime": int(density * 0.22),
            "capacity": int(density),
            "status": "critical" if density >= 85.0 else ("warning" if density >= 60.0 else "safe"),
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
    if density >= 85.0:
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
    
    # 3. REGISTER IN GUARD MANAGER
    await guard_manager.connect(uid, guard_zone, name, websocket)
    
    try:
        # Stream telemetry heartbeat, receive client acknowledgments
        while True:
            # Maintain active connection, listening for incoming status updates from guards
            data = await websocket.receive_text()
            print(f"[WS GUARD ALERT] Msg from {name} ({uid}): {data}")
            
    except WebSocketDisconnect:
        guard_manager.disconnect(uid)
    except Exception as e:
        print(f"[WS GUARD ERROR] Exception with {name}: {e}")
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
