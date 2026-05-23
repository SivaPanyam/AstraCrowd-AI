#!/bin/sh
set -e

echo "[START] Launching AstraCrowd API on 127.0.0.1:8081..."
uvicorn app.main:app --host 127.0.0.1 --port 8081 --workers 1 &
API_PID=$!

cleanup() {
  echo "[STOP] Shutting down..."
  kill "$API_PID" 2>/dev/null || true
  exit 0
}
trap cleanup TERM INT

# Wait until API accepts connections
for i in 1 2 3 4 5 6 7 8 9 10; do
  if wget -q -O /dev/null http://127.0.0.1:8081/health 2>/dev/null; then
    echo "[START] API ready."
    break
  fi
  sleep 1
done

echo "[START] Launching nginx on :8080 (public entrypoint)..."
exec nginx -g 'daemon off;'
