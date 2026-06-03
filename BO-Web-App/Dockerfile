# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_* vars are baked into the JS bundle at build time.
# Defaults point at localhost — correct for a dev machine where the browser
# reaches the backend directly via exposed ports.
ARG VITE_API_BASE_URL=http://localhost:8081/api/v1
ARG VITE_HEALTH_URL=http://localhost:8081/actuator/health
ARG VITE_KEYCLOAK_URL=http://localhost:8080
ARG VITE_KEYCLOAK_REALM=backoffice
ARG VITE_KEYCLOAK_CLIENT_ID=payzo-backoffice-app

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_HEALTH_URL=$VITE_HEALTH_URL \
    VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL \
    VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM \
    VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID

RUN npm run build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://localhost:80/ || exit 1
