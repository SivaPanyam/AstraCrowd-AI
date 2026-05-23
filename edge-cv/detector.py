import asyncio
import json
import os
import sys
import time
import urllib.request
import urllib.error
import cv2
import numpy as np

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("[DETECTOR] Warning: 'ultralytics' library not installed. Running in sandbox simulation mode.")

# Configuration
YOLO_MODEL_NAME = "yolov8n.pt"
BACKEND_API_URL = "http://localhost:8000/api/telemetry"
POST_INTERVAL = 2.0  # Seconds between telemetry dispatches

# Operational threshold capacities for zones to calculate density percentage
ZONE_CAPACITIES = {
    "Gate 1": 25,
    "Gate 2": 25
}

def post_telemetry(payload: dict):
    """
    Sends the packaged JSON telemetry payload to the FastAPI backend API
    using Python's robust built-in urllib standard library.
    """
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        BACKEND_API_URL, 
        data=data, 
        headers={"Content-Type": "application/json"}
    )
    try:
        # Perform synchronous POST request
        with urllib.request.urlopen(req, timeout=3.0) as response:
            status_code = response.getcode()
            if status_code in (200, 201):
                print(f"[DETECTOR POST] Telemetry sent: Zone={payload['zone_id']} Density={payload['density_percentage']}%")
            else:
                print(f"[DETECTOR POST] Received unexpected status code: {status_code}")
    except urllib.error.URLError as e:
        print(f"[DETECTOR POST ERROR] Could not connect to backend ({e.reason}). Is FastAPI server running?")
    except Exception as e:
        print(f"[DETECTOR POST ERROR] Anomaly encountered during network post: {e}")

def run_crowd_detector():
    """
    Processes video feed frame by frame, performs YOLOv8 detection on persons,
    partitions frame spatially into Gate 1/Gate 2 zones, and POSTs crowd density percentages.
    """
    print("[DETECTOR] Initializing Crowd Ingress Detector Node...")
    
    # Initialize YOLOv8 Model if library is installed
    model = None
    if YOLO_AVAILABLE:
        try:
            print(f"[DETECTOR] Loading YOLOv8 Model: {YOLO_MODEL_NAME}...")
            model = YOLO(YOLO_MODEL_NAME)
            print("[DETECTOR] YOLOv8 loaded successfully.")
        except Exception as e:
            print(f"[DETECTOR] Failed to load YOLOv8 model layers: {e}. Defaulting to sandbox.")
            model = None

    # Open video capture device (0 is standard local webcam)
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[DETECTOR] Warning: No hardware video capture device active. Initiating virtual video stream.")

    last_post_time = time.time()
    
    try:
        while True:
            frame_start = time.time()
            
            gate1_count = 0
            gate2_count = 0
            
            # Read frame
            ret = False
            if cap.isOpened():
                ret, frame = cap.read()
                
            if ret and frame is not None:
                h, w, _ = frame.shape
                
                # Perform YOLOv8 inference if model is active
                if model is not None:
                    # Class 0 represents 'person' in standard COCO datasets
                    results = model(frame, verbose=False, classes=[0])
                    
                    if len(results) > 0 and results[0].boxes is not None:
                        for box in results[0].boxes:
                            # Extract bounding box coordinates [x1, y1, x2, y2]
                            coords = box.xyxy[0].cpu().numpy()
                            # Find center X coordinate of detected person
                            center_x = (coords[0] + coords[2]) / 2.0
                            
                            # Spatial frame partitioning: 
                            # Left 50% = Gate 1, Right 50% = Gate 2
                            if center_x < (w / 2.0):
                                gate1_count += 1
                            else:
                                gate2_count += 1
                else:
                    # Mock detection count in case model is missing (for local testing)
                    gate1_count = random_detection_simulation(last_post_time, 12, 22)
                    gate2_count = random_detection_simulation(last_post_time + 1, 8, 18)
            else:
                # Direct simulation mode if no camera connected
                gate1_count = random_detection_simulation(last_post_time, 15, 23)
                gate2_count = random_detection_simulation(last_post_time + 10, 6, 17)

            # Calculate density percentages
            gate1_density = min(100.0, round((gate1_count / ZONE_CAPACITIES["Gate 1"]) * 100.0, 1))
            gate2_density = min(100.0, round((gate2_count / ZONE_CAPACITIES["Gate 2"]) * 100.0, 1))

            # Dispatch telemetry payload every 2 seconds
            current_time = time.time()
            if current_time - last_post_time >= POST_INTERVAL:
                # Package payloads
                payload_gate1 = {
                    "timestamp": current_time,
                    "zone_id": "Gate 1",
                    "density_percentage": gate1_density
                }
                payload_gate2 = {
                    "timestamp": current_time,
                    "zone_id": "Gate 2",
                    "density_percentage": gate2_density
                }
                
                # POST telemetry data to FastAPI backend endpoints
                post_telemetry(payload_gate1)
                post_telemetry(payload_gate2)
                
                last_post_time = current_time

            # Maintain frame rates/intervals (targets 10 FPS for CV pipeline check)
            elapsed = time.time() - frame_start
            delay = max(0.01, 0.1 - elapsed)
            time.sleep(delay)
            
    except KeyboardInterrupt:
        print("\n[DETECTOR] Detector thread cleanly halted by KeyboardInterrupt.")
    finally:
        if cap.isOpened():
            cap.release()

def random_detection_simulation(seed_offset, min_people, max_people):
    """Generates elegant mock people counts for simulation fallback."""
    # Use sinusoid noise based on time to simulate realistic fluctuating ingress flows
    t = time.time() + seed_offset
    sin_wave = (np.sin(t / 10.0) + 1.0) / 2.0  # Scales between 0 and 1
    people = min_people + sin_wave * (max_people - min_people)
    return int(people + np.random.randint(-1, 2))

if __name__ == "__main__":
    run_crowd_detector()
