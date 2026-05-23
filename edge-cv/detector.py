import argparse
import asyncio
from datetime import datetime, timezone
import json
import os
import random
import sys
import time
import cv2
import numpy as np
import requests

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
    "Gate_1": 25,
    "Gate_2": 25
}

def post_telemetry(payload: dict):
    """
    Sends the packaged JSON telemetry payload to the FastAPI backend API
    using a robust requests.post() wrapper.
    Gracefully handles backend connectivity drops without crashing the loop.
    """
    try:
        response = requests.post(BACKEND_API_URL, json=payload, timeout=3.0)
        if response.status_code in (200, 201):
            print(f"[DETECTOR POST] Successfully synced: Gate={payload['gate_id']} Density={payload['density_percentage']}%")
        else:
            print(f"[DETECTOR WARNING] Backend returned status code {response.status_code}: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"[DETECTOR CONNECTIVITY DROP] Backend unreachable ({e}). Continuing frame processing...")

def run_crowd_detector():
    """
    Processes video feed frame by frame, performs YOLOv8 detection on persons,
    partitions frame spatially, and posts crowd density metrics at regular intervals.
    """
    # 1. PARSE CLI SOURCE ARGUMENTS
    parser = argparse.ArgumentParser(description="AstraCrowd AI Edge CV Ingress Node Detector")
    parser.add_argument(
        "--source", 
        type=str, 
        default=None, 
        help="Path to external video file, stream URL, or camera index (default: falls back to index 0/mock)"
    )
    args = parser.parse_args()
    source = args.source

    print("[DETECTOR] Initializing Crowd Ingress Detector Node...")
    
    # 2. CACHE YOLOv8 MODEL LAYERS
    model = None
    if YOLO_AVAILABLE:
        try:
            print(f"[DETECTOR] Loading YOLOv8 Model: {YOLO_MODEL_NAME}...")
            model = YOLO(YOLO_MODEL_NAME)
            print("[DETECTOR] YOLOv8 loaded successfully.")
        except Exception as e:
            print(f"[DETECTOR] Failed to load YOLOv8 model layers: {e}. Defaulting to sandbox.")
            model = None

    # 3. CONFIGURE HARDWARE VIDEO STREAM
    cap = None
    if source is not None:
        try:
            # Check if source is a camera index integer
            source_parsed = int(source)
        except ValueError:
            source_parsed = source
            
        print(f"[DETECTOR] Attempting to open custom stream source: {source_parsed}")
        cap = cv2.VideoCapture(source_parsed)
        if not cap.isOpened():
            print(f"[DETECTOR] Warning: Custom source '{source}' unreachable. Falling back to webcam 0.")
            cap = cv2.VideoCapture(0)
    else:
        print("[DETECTOR] Source path not provided. Initiating default webcam index 0.")
        cap = cv2.VideoCapture(0)

    if cap is not None and not cap.isOpened():
        print("[DETECTOR] Warning: Webcam index 0 inactive. Proceeding in virtual sandbox simulation mode.")

    last_post_time = time.time()
    
    try:
        while True:
            frame_start = time.time()
            
            gate1_count = 0
            gate2_count = 0
            
            # Read frame
            ret = False
            if cap is not None and cap.isOpened():
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
            gate1_density = min(100.0, round((gate1_count / ZONE_CAPACITIES["Gate_1"]) * 100.0, 1))
            gate2_density = min(100.0, round((gate2_count / ZONE_CAPACITIES["Gate_2"]) * 100.0, 1))

            # Dispatch telemetry payload every 2 seconds
            current_time = time.time()
            if current_time - last_post_time >= POST_INTERVAL:
                # Format ISO-8601 UTC string
                iso_timestamp = datetime.now(timezone.utc).isoformat()
                
                # Packaging strictly to: {"gate_id": "Gate_1", "density_percentage": 85.5, "timestamp": "ISO-8601-string"}
                payload_gate1 = {
                    "gate_id": "Gate_1",
                    "density_percentage": gate1_density,
                    "timestamp": iso_timestamp
                }
                payload_gate2 = {
                    "gate_id": "Gate_2",
                    "density_percentage": gate2_density,
                    "timestamp": iso_timestamp
                }
                
                # POST telemetry data
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
        if cap is not None and cap.isOpened():
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
