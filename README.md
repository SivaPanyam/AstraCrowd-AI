# AstraCrowd AI

Real-time **stadium crowd intelligence** platform for operations centers. Monitor gate congestion, stream alerts to security staff, ingest edge camera telemetry, and use an AI copilot for routing decisions.

Repository: [https://github.com/SivaPanyam/AstraCrowd-AI](https://github.com/SivaPanyam/AstraCrowd-AI)

---

## Features

- **Live gate dashboard** — flow rate, wait time, capacity %, and safe / warning / critical status
- **WebSocket telemetry** — real-time updates to ops dashboards and zone-targeted guard alerts
- **Edge computer vision** — optional YOLOv8 person detection at stadium entry points
- **AI operations copilot** — Gemini-powered chat over live gate metrics (with local mock fallback)
- **Firebase authentication** — production-ready auth with developer sandbox bypass for local demos
- **Predictive congestion alerts** — background worker and critical-density triggers at ≥85% capacity

---

## Architecture

**Production (single URL)** — one Docker image runs nginx (port 8080) and FastAPI (internal 8081). The browser uses the same host for the PWA, `/api/*`, and `/ws/*`.

```
                    ┌─────────────────────────────────────┐
  Browser ────────► │  nginx :8080  (Cloud Run / Docker) │
                    │    /          → React PWA           │
                    │    /api/*     → FastAPI             │
                    │    /ws/*      → FastAPI WebSockets  │
                    └─────────────────────────────────────┘
```

**Local dev** — optional split stack via `start_local_system.py` (frontend :5173, API :8000).

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10+ |
| Node.js | 18+ |
| npm | 9+ |

Optional: webcam + `ultralytics` for live edge CV; Firebase and Gemini API keys for production features.

---

## Quick start

### 1. Clone the repository

```bash
git clone https://github.com/SivaPanyam/AstraCrowd-AI.git
cd AstraCrowd-AI
```

### 2. Install dependencies

**Backend**

```bash
cd backend
pip install -r requirements.txt
cd ..
```

**Frontend**

```bash
cd frontend
npm install
cd ..
```

### 3. Run the full stack (recommended)

From the project root:

```bash
python start_local_system.py
```

This starts the API, the Vite dev server, and (after 5 seconds) a demo telemetry trigger for Gate 3.

Press **Ctrl+C** in that terminal to stop everything cleanly.

### 4. Open the app

| Service | URL |
|---------|-----|
| **Dashboard** | [http://localhost:5173](http://localhost:5173) |
| **Backend API** | [http://localhost:8000](http://localhost:8000) |
| **API docs (Swagger)** | [http://localhost:8000/docs](http://localhost:8000/docs) |

On the login screen, use **Enter Sandbox** (or leave credentials empty and sign in) for local development without Firebase.

### Docker (single URL — same as Cloud Run)

```bash
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080) — dashboard, API, and WebSockets on one origin.

---

## Manual run (separate terminals)

**Backend**

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend**

```bash
cd frontend
npm run dev
```

**Edge CV (optional)**

```bash
cd edge-cv
pip install -r requirements.txt
python main.py
```

**Demo telemetry trigger**

```bash
python backend/demo_trigger.py --gate 3 --density 45
```

---

## Environment variables

### Backend

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key for `/api/chat` (mock fallback if unset) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Path to Firebase Admin service account JSON |
| `ENVIRONMENT` | Set to `production` to disable `dev-token` / `dummy-guard-token` bypasses |

### Frontend (Vite — prefix with `VITE_`)

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase web client config |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_BACKEND_API_URL` | REST API base (default `http://localhost:8000`) |
| `VITE_BACKEND_WS_URL` | WebSocket base (default `ws://localhost:8000`) |

Copy secrets into `.env` files locally; never commit credentials (see `.gitignore`).

---

## Crowd density thresholds

Shared across backend, frontend, and [DESIGN.md](DESIGN.md):

| Capacity | Status | UI |
|----------|--------|-----|
| &lt; 60% | safe | Green |
| 60–84% | warning | Amber |
| ≥ 85% | critical | Red + guard alerts + DIVERT signage |

Implementation: `backend/app/thresholds.py`, `frontend/src/gateThresholds.ts`.

---

## Testing

**Backend unit tests**

```bash
cd backend
python -m pytest tests -q
```

**Frontend unit tests**

```bash
cd frontend
npm run test
```

**Integration tests** (backend must be running on port 8000)

```bash
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000
# separate terminal:
python test_astracrowd.py
```

---

## Deployment (Cloud Run — single URL)

Prerequisites: [Google Cloud SDK](https://cloud.google.com/sdk), billing enabled, project selected (`gcloud config set project YOUR_PROJECT`).

```bash
# One-time: enable APIs and Artifact Registry
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud artifacts repositories create astracrowd-registry \
  --repository-format=docker --location=us-central1 || true

# Build and deploy (root Dockerfile → one Cloud Run service)
gcloud builds submit --config=cloudbuild.yaml

# Get your live URL
gcloud run services describe astracrowd-ai --region=us-central1 --format='value(status.url)'
```

Optional secrets on the service:

```bash
gcloud run services update astracrowd-ai --region=us-central1 \
  --set-env-vars=ENVIRONMENT=production \
  --set-secrets=GEMINI_API_KEY=gemini-api-key:latest
```

| Path on your URL | Purpose |
|------------------|---------|
| `/` | Stadium ops dashboard |
| `/api/telemetry` | Edge camera ingest |
| `/api/chat` | AI copilot |
| `/docs` | Swagger UI |
| `/health` | Health check |

---

## Project structure

```
AstraCrowd-AI/
├── Dockerfile         # Unified image (nginx + FastAPI) for Cloud Run
├── docker-compose.yml # Local single-URL preview on :8080
├── deploy/            # nginx.conf + start.sh for unified container
├── backend/           # FastAPI app, tests
├── frontend/          # React + Vite PWA
├── edge-cv/           # YOLOv8 edge telemetry (optional, separate)
├── cloudbuild.yaml    # GCP build → deploy astracrowd-ai
└── start_local_system.py
```

---

## API overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/api/telemetry` | Ingest edge crowd density |
| `POST` | `/api/chat` | AI ops assistant (Bearer token required) |
| `WS` | `/ws/client` | Dashboard live telemetry |
| `WS` | `/ws/alerts?token=…&zone=…` | Guard alerts (Firebase or dev token) |
| `WS` | `/ws/edge/{node_id}` | Edge CV node stream |

---

## License

No license file is included yet. Add one before public distribution if required.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run backend and frontend tests
4. Open a pull request against `main`
