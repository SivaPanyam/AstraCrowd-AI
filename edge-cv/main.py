import asyncio
import json
import random
import sys
import time
import cv2
import numpy as np
import websockets

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("[EDGE CV] ultralytics package not installed. Running in simulation mode.")

# Configuration
NODE_ID = "camera-charlie"
BACKEND_WS_URL = f"ws://localhost:8000/ws/edge/{NODE_ID}"
FPS = 15  # Frame processing rate

async def stream_telemetry():
    """
    Main asynchronous loop to ingest camera frames, run YOLOv8, and stream 
    parsed telemetric payloads directly to the FastAPI coordinate cluster.
    """
    print(f"[EDGE CV] Starting crowd intelligence engine on node '{NODE_ID}'...")
    
    # Initialize YOLOv8 Model if available
    model = None
    if YOLO_AVAILABLE:
        try:
            print("[EDGE CV] Loading pre-trained YOLOv8 Nano model...")
            # Automatically downloads yolov8n.pt if not locally cached
            model = YOLO("yolov8n.pt")
            print("[EDGE CV] YOLOv8 model loaded successfully.")
        except Exception as e:
            print(f"[EDGE CV] Failed to load YOLOv8 model: {e}. Defaulting to simulator.")
            model = None

    # Open standard camera/video stream (default: 0 for laptop webcam)
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[EDGE CV] Warning: No active physical hardware camera detected. Initiating Virtual Video Feed.")
        
    while True:
        try:
            print(f"[EDGE CV] Connecting to backend telemetry socket: {BACKEND_WS_URL}")
            async with websockets.connect(BACKEND_WS_URL) as ws:
                print(f"[EDGE CV] Connection established! Node '{NODE_ID}' online.")
                
                # Internal listener for command payloads from the ops center
                async def receive_directives():
                    try:
                        async for message in ws:
                            payload = json.loads(message)
                            if payload.get("type") == "control_directive":
                                print(f"\n[EDGE CV CONTROL] Received administrative directive from Ops Center!")
                                print(f"  Directive: {payload.get('directive')}")
                                print(f"  Divert crowd from {payload.get('source')} to {payload.get('target')}")
                                print("  Recalibrating local sign boards and visual flow cues...\n")
                    except Exception as e:
                        print(f"[EDGE CV CONTROL ERROR] Listener halted: {e}")

                # Run control listener in background
                asyncio.create_task(receive_directives())

                # Frame processing and telemetry streaming loop
                while True:
                    start_time = time.time()
                    
                    people_count = 0
                    flow_rate = 0
                    density_pct = 0
                    
                    # 1. READ FRAME
                    if cap.isOpened():
                        ret, frame = cap.read()
                        if not ret:
                            # If end of file or error, cycle back or generate mock
                            ret = False
                    else:
                        ret = False
                        
                    # 2. RUN INFERENCE
                    if ret and model is not None:
                        # Perform inference using YOLOv8
                        # classes=[0] targets COCO 'person' class specifically
                        results = model(frame, verbose=False, classes=[0])
                        
                        # Count total detected bounding boxes of class 0 (person)
                        if len(results) > 0:
                            boxes = results[0].boxes
                            people_count = len(boxes)
                            
                        # Simulate wait calculations based on count
                        flow_rate = int(people_count * 1.5 + random.randint(-2, 2))
                        density_pct = min(100, int((people_count / 150) * 100))
                    else:
                        # Sandbox / Simulation Mode if camera or model is not loaded
                        # Simulates stadium entrance dynamics with high Charlie traffic
                        people_count = random.randint(95, 125)
                        flow_rate = int(people_count * 1.1)
                        density_pct = min(100, int((people_count / 130) * 100))

                    # 3. CONSTRUCT TELEMETRIC PACKAGE
                    telemetry_payload = {
                        "node_id": NODE_ID,
                        "people_count": people_count,
                        "flow_rate_per_min": flow_rate,
                        "density_percentage": density_pct,
                        "timestamp": time.time()
                    }
                    
                    # 4. TRANSMIT OVER WEBSOCKET
                    await ws.send(json.dumps(telemetry_payload))
                    print(f"[EDGE CV] Transmitting telemetric payload: {people_count} detections, density={density_pct}%")

                    # Maintain target FPS
                    elapsed = time.time() - start_time
                    delay = max(0.01, (1.0 / FPS) - elapsed)
                    await asyncio.sleep(delay)
                    
        except (websockets.ConnectionClosed, ConnectionRefusedError) as e:
            print(f"[EDGE CV] Backend disconnected/unreachable ({e}). Re-attempting connection in 5 seconds...")
            await asyncio.sleep(5)
        except Exception as e:
            print(f"[EDGE CV] Anomaly encountered: {e}. Recovering thread...")
            await asyncio.sleep(2)
            
    # Clean up hardware resources on exit
    if cap.isOpened():
        cap.release()

if __name__ == "__main__":
    try:
        asyncio.run(stream_telemetry())
    except KeyboardInterrupt:
        print("\n[EDGE CV] Crowd intelligence engine shutdown cleanly by request.")
        sys.exit(0)
