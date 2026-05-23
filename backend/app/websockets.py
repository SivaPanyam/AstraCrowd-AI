from typing import List, Dict
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # Store active dashboard clients
        self.active_clients: List[WebSocket] = []
        # Store registered CV camera feed nodes
        self.active_edge_nodes: Dict[str, WebSocket] = {}

    async def connect_client(self, websocket: WebSocket):
        """Register a new dashboard client connection."""
        await websocket.accept()
        self.active_clients.append(websocket)
        print(f"[WS MANAGER] Dashboard client connected. Total clients: {len(self.active_clients)}")

    def disconnect_client(self, websocket: WebSocket):
        """Unregister a dashboard client connection."""
        if websocket in self.active_clients:
            self.active_clients.remove(websocket)
            print(f"[WS MANAGER] Dashboard client disconnected. Total clients: {len(self.active_clients)}")

    async def register_edge_node(self, node_id: str, websocket: WebSocket):
        """Register an edge computer vision telemetry camera node."""
        await websocket.accept()
        self.active_edge_nodes[node_id] = websocket
        print(f"[WS MANAGER] Edge CV Node '{node_id}' online. Total edge nodes: {len(self.active_edge_nodes)}")

    def disconnect_edge_node(self, node_id: str):
        """Unregister an edge CV camera node."""
        if node_id in self.active_edge_nodes:
            del self.active_edge_nodes[node_id]
            print(f"[WS MANAGER] Edge CV Node '{node_id}' offline. Total edge nodes: {len(self.active_edge_nodes)}")

    async def broadcast_to_clients(self, message: dict):
        """Send JSON telemetry data to all active operational dashboards."""
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
