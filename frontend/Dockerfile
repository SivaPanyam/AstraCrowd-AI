# =====================================================================
# STAGE 1: COMPILE VITE STATIC PWA ASSETS
# =====================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install project dependencies
COPY package*.json ./
RUN npm ci

# Backend URLs are baked in at build time (set by Cloud Build after backend deploy)
ARG VITE_BACKEND_API_URL=http://localhost:8000
ARG VITE_BACKEND_WS_URL=ws://localhost:8000
ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL
ENV VITE_BACKEND_WS_URL=$VITE_BACKEND_WS_URL

# Copy sources and compile production bundle
COPY . .
RUN npm run build

# =====================================================================
# STAGE 2: ULTRA-LIGHTWEIGHT NGINX RUNNER
# =====================================================================
FROM nginx:stable-alpine AS runner

# Copy compiled files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Replace default Nginx configuration with Cloud Run optimized SPA config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose serverless default port
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
