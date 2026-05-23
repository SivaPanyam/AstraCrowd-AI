import argparse
import requests
import datetime
import sys

def main():
    parser = argparse.ArgumentParser(description="AstraCrowd AI Telemetry Simulation Trigger")
    parser.add_argument("--gate", type=str, default="3", help="Gate ID suffix (e.g. 3 for Gate_3)")
    parser.add_argument("--density", type=float, default=45.0, help="Crowd density percentage (0-100)")
    args = parser.parse_args()

    # Format gate ID as expected by backend (Gate_3 or Gate_1)
    gate_id = f"Gate_{args.gate}"
    
    # Construct standard TelemetryPayload matching backend specifications
    payload = {
        "gate_id": gate_id,
        "density_percentage": args.density,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
    }

    url = "http://localhost:8000/api/telemetry"
    print(f"[DEMO TRIGGER] Initializing baseline crowd state: {gate_id} at {args.density}% density...")
    
    try:
        response = requests.post(url, json=payload, timeout=5)
        if response.status_code == 201:
            print(f"[DEMO TRIGGER] Success: Backend ingested crowd state. Status code: {response.status_code}")
            sys.exit(0)
        else:
            print(f"[DEMO TRIGGER] Error: Backend returned status code {response.status_code}: {response.text}")
            sys.exit(1)
    except Exception as e:
        print(f"[DEMO TRIGGER] Exception: Failed to connect to backend at {url}: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
