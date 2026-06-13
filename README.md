# PayZo

**Tunisian multi-bank digital banking platform with real-time ML fraud detection on P2P transfers.**

![Java 17](https://img.shields.io/badge/Java-17-blue)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.2-green)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-316192)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)

PFE project — Faculté des Sciences de Monastir, 2025–2026.
Author: **Mohamed Ben Salem** · Supervisor: **Mr. Mohsen Maraoui**
Full write-up: [PayZo_Report.pdf](Documents/Report/PayZo_Report.pdf)

---

## Overview

Tunisian retail banking is fragmented — clients hold accounts across several banks and juggle incompatible apps with no unified view. PayZo puts multi-bank access behind one platform: a client web app, an Expo mobile app, and an Electron backoffice for operations staff.

Every P2P transfer is scored in real time before money moves. Low-risk transfers execute immediately; medium- and high-risk transfers are suspended for analyst review. Scoring runs through a three-tier fallback (LightGBM → Random Forest → rule firewall) so the transfer pipeline never blocks on ML availability.

---

## Architecture

The Dockerized stack runs on a single bridge network (`payzo-net`):

| Service | Port | Role |
|---|---|---|
| `backend` | 8081 | Spring Boot API — auth, transfers, fraud alerts, notifications |
| `ml-service` | 5000 | FastAPI inference — three-tier transfer scorer |
| `cbs-simulator` | 8082 | Core Banking Simulator — Tunisian ledger (seeded banks, clients, RIBs) |
| `keycloak` | 8080 | Identity provider — `clients` and `backoffice` realms |
| `postgres-db` | 5432 | PostgreSQL 16 — hosts `payzo_db`, `keycloak_db`, `cbs_db` |
| `client-web-app` | 5173 | React SPA (Vite dev server) |
| `nginx` | 80 | Reverse proxy — `/api/` to backend, `/` to client SPA |

The **backoffice** (`BO-Web-App`) and **mobile** (`Client-Mobile-App`) apps run on the host, outside Docker. The backend reads the CBS database directly through a second JPA datasource, so balance and account lookups during a transfer skip the REST hop.

---

## Tech stack

| Layer | Stack |
|---|---|
| Backend | Java 17, Spring Boot 3.2, Spring Security + OAuth2 (JWT), Spring Data JPA, WebFlux WebClient, MapStruct |
| ML | Python 3.11, FastAPI, LightGBM, Random Forest, isotonic calibration, SHAP |
| Client web | React 19, Vite, TypeScript, Tailwind CSS v4, keycloak-js |
| Backoffice | React 19, Vite, TypeScript, Tailwind CSS v4, Electron |
| Mobile | React Native (Expo), TypeScript |
| Infra | PostgreSQL 16, Keycloak 24, Nginx, Docker Compose |

---

## Repository layout

```
PayZo/
├── Backend/             Spring Boot API — auth, transfers, fraud, notifications
├── ML-Service/          FastAPI scorer — training pipeline + 3-tier inference
├── CBS-Simulator/       Core Banking Simulator — Tunisian ledger, seeded RIBs
├── Client-Web-App/      React client SPA
├── Client-Mobile-App/   Expo React Native app
├── BO-Web-App/          React + Electron backoffice
├── Keycloak/realms/     Realm JSON imports
├── Postgres-DB/         init.sh — bootstraps keycloak_db and cbs_db
├── NGINX/               nginx.conf — reverse proxy + CSP
├── Documents/           PFE report (LaTeX source + PDF) and diagrams
├── docker-compose.yml
├── .env.example
└── bootstrap-superadmin.sh
```

---

## Fraud detection

Every confirmed P2P transfer is scored before execution. The scorer has three tiers, each a fallback for the one above:

1. **LightGBM** — gradient-boosting model on 24 features (amount and balance ratios, sender velocity, geographic distance, account age, trust score, beneficiary familiarity, per-user norms).
2. **Random Forest** — bagging fallback when tier 1 is unavailable.
3. **Rule firewall** — deterministic heuristics (velocity, amount thresholds, new-account flags); always available.

Scores map to risk bands (`LOW < 0.30 ≤ MEDIUM < 0.70 ≤ HIGH`, tunable by the SuperAdmin at runtime). **LOW** executes immediately and notifies both parties; **MEDIUM/HIGH** suspends the transaction and opens a `FraudAlert` for analyst review. The backend (`MlIntegrationService`) mirrors the same fallback independently and notifies analysts whenever the active tier changes.

---

## Getting started

**Prerequisites:** Docker Desktop (≥ 4 GB RAM), Python, and `curl`.

### 1. Configure

```bash
git clone https://github.com/Mohamedbs456/PayZo.git
cd PayZo
cp .env.example .env
```

The defaults in `.env.example` work out of the box for a local run. Edit `.env` only to wire up real email or SMS credentials.

### 2. Start the stack

```bash
docker compose up -d --build
```

The backend waits for Keycloak and CBS to report healthy. On first run, allow 2–3 minutes for Keycloak to import the realm files. Watch readiness with `docker compose ps`.

### 3. Bootstrap Keycloak and the SuperAdmin

On a fresh stack (or after `docker compose down -v`):

```bash
./bootstrap-superadmin.sh
```

This grants the backend the `realm-management` roles it needs, creates the `SUPERADMIN` user in the `backoffice` realm, exposes realm roles in JWTs, and restarts the backend so it mirrors the SuperAdmin into the local database. It is idempotent.

### 4. Run the host apps

```bash
# Backoffice (Electron)
cd BO-Web-App && npm install && npm run dev        # Vite on 5174
npm run electron                                   # desktop window

# Mobile (Expo)
cd Client-Mobile-App && npm install && npx expo start
```

---

## Service URLs and credentials

| Service | URL |
|---|---|
| Client web app | http://localhost:5173 |
| Backoffice (dev server) | http://localhost:5174 |
| Spring Boot API | http://localhost:8081 |
| Swagger UI | http://localhost:8081/swagger-ui.html |
| Keycloak admin console | http://localhost:8080 |
| CBS Simulator | http://localhost:8082/cbs/api/v1/health |
| ML Service | http://localhost:5000/ml/api/v1/health |

**Development credentials only:**

| Account | Username | Password |
|---|---|---|
| Keycloak admin console | `admin` | `admin` |
| PayZo SuperAdmin (backoffice) | `superadmin` | `Superadmin123!` |

The CBS Simulator seeds Tunisian banks, 50 clients with 20-digit mod-97 RIBs, and a backlog of transactions on first startup (deterministic, seed 42). To find a seeded CIN for login:

```bash
docker compose logs cbs-simulator | grep "sample CINs"
```

---

## Testing

```bash
cd Backend && ./mvnw test       # backend unit tests
cd ML-Service && pytest tests/  # ML service tests
```

---

## Author

**Mohamed Ben Salem** — Faculté des Sciences de Monastir, Licence en Sciences Informatiques, PFE 2025–2026.
Supervisor: **Mr. Mohsen Maraoui**.
