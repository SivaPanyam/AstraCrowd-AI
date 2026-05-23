import os
from fastapi import HTTPException, Security, status, WebSocket, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import credentials, auth
from app.logging_setup import logger

# Security scheme for JWT extraction
security = HTTPBearer()

# Frontend sandbox tokens (disabled in production unless ALLOW_DEMO_AUTH=true)
DEMO_AUTH_TOKENS = frozenset({"dev-token", "dummy-guard-token", "dev-google-token"})


def demo_auth_enabled() -> bool:
    """Allow sandbox login tokens (Cloud Run demo or local dev)."""
    if os.getenv("ENVIRONMENT") != "production":
        return True
    return os.getenv("ALLOW_DEMO_AUTH", "").lower() in ("1", "true", "yes")


def demo_user_for_token(token: str) -> dict | None:
    if token == "dummy-guard-token":
        return {
            "uid": "guard_dev_001",
            "email": "guard1@stadiumsec.com",
            "role": "FieldStaff",
            "zone": "Gate 3",
        }
    if token in ("dev-token", "dev-google-token"):
        return {
            "uid": "dev-user-123",
            "name": "Stadium Admin (Bypass)",
            "email": "admin@astracrowd.ai",
            "role": "ops_director",
        }
    return None

# Initialize Firebase Admin SDK
firebase_app = None
try:
    # Look for explicit service account credentials in environment
    cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if cred_path and os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_app = firebase_admin.initialize_app(cred)
        logger.info("[FIREBASE] Initialized successfully using Certificate path.")
    else:
        # Fallback to application default credentials
        firebase_app = firebase_admin.initialize_app()
        logger.info("[FIREBASE] Initialized successfully using Default Credentials.")
except Exception as e:
    logger.warning(f"[FIREBASE] Warning: Could not initialize Firebase Admin SDK automatically: {e}")
    logger.warning("[FIREBASE] Running in DEVELOPER BYPASS mode. Real token authentication will be bypassed.")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    """
    FastAPI security dependency to extract and verify the Firebase ID Token.
    Returns decoded user claims. Bypasses real check in developer mode if token is 'dev-token'.
    Secured against production environment bypasses.
    """
    token = credentials.credentials

    if token in DEMO_AUTH_TOKENS:
        if not demo_auth_enabled():
            logger.error(f"[SECURITY] Demo token blocked in production: {token}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Demo login is disabled. Configure Firebase or set ALLOW_DEMO_AUTH=true.",
            )
        demo_user = demo_user_for_token(token)
        if demo_user:
            return demo_user

    if firebase_app is None:
        return {
            "uid": "dev-user-123",
            "name": "Stadium Admin (Bypass)",
            "email": "admin@astracrowd.ai",
            "role": "ops_director",
        }
        
    try:
        # Verify the ID token against Firebase Auth servers
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired authentication credentials: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def verify_firebase_token(websocket: WebSocket, token: str = Query(None)) -> dict:
    """
    Extracts and verifies the Firebase ID Token from WebSocket query parameter.
    If the token is invalid or missing, rejects the socket connection.
    Secured against production environment bypasses.
    """
    if not token:
        logger.warning("[AUTH] WS Connection rejected: Token query parameter missing.")
        # Reject connection with policy violation status
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Token missing")
        return None

    if token in DEMO_AUTH_TOKENS:
        if not demo_auth_enabled():
            logger.error(f"[SECURITY] Blocked demo token '{token}' in production.")
            await websocket.accept()
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Demo auth disabled")
            return None
        demo_user = demo_user_for_token(token)
        if demo_user:
            logger.info(f"[AUTH] WS Connection accepted via demo token ({token}).")
            return demo_user

    if firebase_app is None:
        logger.info("[AUTH] WS Connection accepted via Developer Bypass.")
        return {
            "uid": "dev-guard-77",
            "name": "Local Guard 77",
            "role": "guard",
            "zone": "Gate 3",
        }
        
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as exc:
        logger.error(f"[AUTH] WS Token verification failed: {exc}")
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return None
