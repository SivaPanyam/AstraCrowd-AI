# =====================================================================
# STAGE 1: BUILD DEPENDENCIES
# =====================================================================
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# =====================================================================
# STAGE 2: FINAL COMPACT RUNNER
# =====================================================================
FROM python:3.11-slim AS runner

WORKDIR /app

# Expose PATH from virtual environment
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Copy application source files
COPY app/ ./app
COPY main.py .

# Cloud Run defaults to exposing port 8080
EXPOSE 8080

# Execute server using Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
