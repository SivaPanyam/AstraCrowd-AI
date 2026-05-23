from typing import List, Dict, Any
from fastapi import WebSocket
from app.logging_setup import logger

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
        logger.info(f"[GUARD MANAGER] Guard '{name}' ({uid}) registered in zone '{zone}'. Total active: {len(self.active_guards)}")

    def disconnect(self, uid: str):
        """Unregister a disconnected guard connection."""
        if uid in self.active_guards:
            name = self.active_guards[uid]["name"]
            del self.active_guards[uid]
            logger.info(f"[GUARD MANAGER] Guard '{name}' ({uid}) disconnected. Remaining: {len(self.active_guards)}")

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
            logger.info(f"[GUARD MANAGER] Transmitted zone alert to {sent_count} guards in: {target_zones}")


class EdgeConnectionManager:
    """Connection manager for edge computer vision (YOLOv8) nodes."""
    def __init__(self):
        self.active_clients: List[WebSocket] = []
        self.active_edge_nodes: Dict[str, WebSocket] = {}

    async def connect_client(self, websocket: WebSocket):
        await websocket.accept()
        self.active_clients.append(websocket)
        logger.info(f"[EDGE MANAGER] Dashboard client online. Total: {len(self.active_clients)}")

    def disconnect_client(self, websocket: WebSocket):
        if websocket in self.active_clients:
            self.active_clients.remove(websocket)
            logger.info(f"[EDGE MANAGER] Dashboard client offline. Total: {len(self.active_clients)}")

    async def register_edge_node(self, node_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_edge_nodes[node_id] = websocket
        logger.info(f"[EDGE MANAGER] CV Node '{node_id}' online. Total: {len(self.active_edge_nodes)}")

    def disconnect_edge_node(self, node_id: str):
        if node_id in self.active_edge_nodes:
            del self.active_edge_nodes[node_id]
            logger.info(f"[EDGE MANAGER] CV Node '{node_id}' offline. Total: {len(self.active_edge_nodes)}")

    async def broadcast_to_clients(self, message: dict):
        disconnected = []
        for connection in self.active_clients:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect_client(conn)
            
    async def send_to_node(self, node_id: str, message: dict):
        """Send configuration, calibration, or model directives back to specific edge cameras."""
        if node_id in self.active_edge_nodes:
            try:
                await self.active_edge_nodes[node_id].send_json(message)
            except Exception:
                self.disconnect_edge_node(node_id)
