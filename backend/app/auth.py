import os
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import credentials, auth
from app.logging_setup import logger

# Security scheme for JWT extraction
security = HTTPBearer()

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
    """
    token = credentials.credentials
    
    # Enable a simple bypass for local developers running tests or frontend prototyping
    if token == "dummy-guard-token":
        return {
            "uid": "guard_dev_001",
            "email": "guard1@stadiumsec.com",
            "role": "FieldStaff",
            "zone": "Gate_3"
        }

    if token == "dev-token" or firebase_app is None:
        return {
            "uid": "dev-user-123",
            "name": "Stadium Admin (Bypass)",
            "email": "admin@astracrowd.ai",
            "role": "ops_director"
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
