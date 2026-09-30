# Camtrack — Backend API

> GPS tracker stock & installation management — NestJS REST API.

The React frontend lives in a **separate repository** (`GPS_TRACKER_front`). This service exposes a JSON REST API, a Swagger UI, and nothing else — no file uploads, no Supabase SDK, no WebSocket.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Data Model](#data-model)
   - [ER Diagram](#er-diagram)
   - [Enums](#enums)
   - [Models](#models)
   - [Indexes & Constraints](#indexes--constraints)
5. [Business Rules](#business-rules)
6. [Authentication & Security](#authentication--security)
7. [Modules & API Endpoints](#modules--api-endpoints)
   - [Auth](#auth)
   - [Users](#users)
   - [Trackers](#trackers)
   - [Clients](#clients)
   - [Vehicles](#vehicles)
   - [Interventions](#interventions)
   - [Dashboard](#dashboard)
8. [Error Handling](#error-handling)
9. [Environment Variables](#environment-variables)
10. [Getting Started](#getting-started)
    - [With Supabase (PostgreSQL)](#with-supabase-postgresql)
    - [With Docker Compose (local Postgres)](#with-docker-compose-local-postgres)
11. [Migrations & Seed](#migrations--seed)
12. [Running Tests](#running-tests)
13. [Docker](#docker)
14. [Test Accounts](#test-accounts)
15. [API Reference Summary](#api-reference-summary)
16. [What Is Done / Not Done](#what-is-done--not-done)
17. [Possible Improvements](#possible-improvements)

---

## Overview

Camtrack tracks the full lifecycle of GPS devices: from warehouse reception, through field installation in client vehicles, to faulty returns and restocking. Two roles exist:

- **STOCK_MANAGER** — manages the tracker inventory, clients, vehicles, and intervention planning.
- **TECHNICIAN** — sees only their own assigned interventions and completes them in the field by installing a tracker.

---

## Architecture

```
GPS_TRACKER_Back/        ← this repo
GPS_TRACKER_front/       ← separate React frontend repo
```

The backend is a standard NestJS monolith with one module per domain. All business rules live in the service layer; controllers are thin routing adapters. A global exception filter normalises every error response. PrismaService is a shared singleton.

```
src/
├── auth/             JWT login + OTP verification + guards + decorators
├── users/            User listing (manager only), lookup helpers
├── trackers/         Tracker CRUD, status transitions, history
├── clients/          Client CRUD
├── vehicles/         Vehicle CRUD
├── interventions/    Planning, cancellation, transactional completion
├── dashboard/        Analytics aggregation
├── prisma/           PrismaService module
└── common/
    ├── email/        Nodemailer OTP delivery
    ├── filters/      Global exception filter + Prisma error mapper
    └── pipes/        ParseIdPipe
```

**Why separate repos?** The frontend and backend can be deployed and versioned independently, built with different pipelines, and run by different teams without coupling.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 10 + TypeScript |
| ORM | Prisma 5 |
| Database | PostgreSQL (Supabase or local Docker) |
| Auth | bcrypt passwords, JWT (passport-jwt), OTP via email |
| Validation | class-validator + class-transformer, global ValidationPipe |
| Email | Nodemailer (Office365 SMTP or any SMTP) |
| API docs | Swagger (`@nestjs/swagger`) at `/api/docs` |
| Tests | Jest + supertest |
| Linting | ESLint + Prettier |
| Containerisation | Docker (single-stage, Node 22 Alpine) |

---

## Data Model

### ER Diagram

```mermaid
erDiagram
    User {
        string id PK
        string username UK
        string email UK
        string passwordHash
        string fullName
        Role role
        boolean isVerified
        string otp
        datetime otpExpiresAt
        datetime createdAt
    }

    Client {
        string id PK
        string name
        string phone
        string address
        datetime createdAt
    }

    Vehicle {
        string id PK
        string clientId FK
        string plate UK
        string brand
        string model
    }

    Tracker {
        string id PK
        string imei UK
        string model
        string simNumber UK
        TrackerStatus status
        string vehicleId FK
        datetime createdAt
    }

    Intervention {
        string id PK
        string clientId FK
        string vehicleId FK
        string technicianId FK
        datetime scheduledAt
        string address
        InterventionStatus status
        string trackerId FK
        datetime completedAt
        datetime createdAt
    }

    TrackerHistory {
        string id PK
        string trackerId FK
        TrackerStatus oldStatus
        TrackerStatus newStatus
        string action
        string userId FK
        string vehicleId FK
        string interventionId FK
        string comment
        datetime createdAt
    }

    Client ||--o{ Vehicle : "owns"
    Client ||--o{ Intervention : "has"
    Vehicle ||--o{ Tracker : "carries"
    Vehicle ||--o{ Intervention : "subject of"
    Vehicle ||--o{ TrackerHistory : "referenced in"
    User ||--o{ Intervention : "assigned to"
    User ||--o{ TrackerHistory : "performed by"
    Tracker ||--o{ Intervention : "used in"
    Tracker ||--o{ TrackerHistory : "history of"
    Intervention ||--o{ TrackerHistory : "triggered by"
```

### Enums

```
Role               STOCK_MANAGER | TECHNICIAN
TrackerStatus      IN_STOCK | INSTALLED | FAULTY | RETURNED
InterventionStatus PLANNED | DONE | CANCELLED
```

### Models

**User** — authenticated actor. Stores a bcrypt `passwordHash`, never the plain password. The `otp` + `otpExpiresAt` fields support the two-step login and registration email verification. `isVerified` is `false` until the OTP is confirmed.

**Client** — company or individual that owns vehicles. Searchable by name and phone.

**Vehicle** — belongs to exactly one Client, identified by a unique licence `plate`. Cannot be deleted while it has linked trackers or interventions.

**Tracker** — the physical GPS device. Identified by a 15-digit `imei` (unique) and a `simNumber` (unique). Status defaults to `IN_STOCK` on creation. Optionally linked to one Vehicle.

**Intervention** — a field visit. Planned by a manager, completed by the assigned technician. When completed, a tracker is atomically claimed and linked. DONE and CANCELLED are terminal states.

**TrackerHistory** — immutable audit log. One row per status change, capturing who changed what, from which status, to which status, via which action, and optionally on which vehicle and intervention.

### Indexes & Constraints

| Table | Index |
|---|---|
| User | `username` UNIQUE, `email` UNIQUE, `role` IDX, `email` IDX |
| Vehicle | `plate` UNIQUE, `clientId` IDX |
| Tracker | `imei` UNIQUE, `simNumber` UNIQUE, `status` IDX, `vehicleId` IDX |
| Intervention | `(technicianId, scheduledAt)` IDX, `status` IDX, `clientId` IDX, `vehicleId` IDX, `technicianId` IDX |
| TrackerHistory | `trackerId` IDX, `userId` IDX, `createdAt` IDX |

**Partial unique index** (Prisma cannot express this, written by hand in the migration):

```sql
CREATE UNIQUE INDEX one_installed_tracker_per_vehicle
  ON "Tracker"("vehicleId")
  WHERE status = 'INSTALLED';
```

This is the database-level safety net ensuring a vehicle can never have two INSTALLED trackers simultaneously, even under concurrent writes.

---

## Business Rules

All rules are enforced in the service layer, never only in the controller.

**Rule 1 — Tracker creation**
A new tracker always starts `IN_STOCK`. IMEI must be unique. A `TrackerHistory` row with `oldStatus = null` and `action = RECEIVED` is written in the same transaction.

**Rule 2 — Status transition map**
Only the following manual transitions are allowed. Everything else returns 409/400.

| From | To | Action recorded |
|---|---|---|
| `IN_STOCK` | `FAULTY` | `DECLARED_FAULTY` |
| `INSTALLED` | `RETURNED` | `REMOVED` |
| `INSTALLED` | `FAULTY` | `DECLARED_FAULTY` |
| `FAULTY` | `RETURNED` | `RETURNED` |
| `RETURNED` | `IN_STOCK` | `RESTOCKED` |

`IN_STOCK → INSTALLED` is intentionally absent from this table. It only happens through intervention completion (rule 3).

Leaving `INSTALLED` always clears `vehicleId` on the tracker. Every accepted change writes a `TrackerHistory` row in the same transaction.

**Rule 3 — Intervention completion (atomic)**
`POST /interventions/:id/complete` executes a single `prisma.$transaction`:

1. Verify the intervention exists AND `technicianId === currentUser.id` (else 404 — no leaking) AND `status === PLANNED` (else 409).
2. Check the target vehicle has no existing `INSTALLED` tracker (else 409).
3. Atomically claim the tracker: `updateMany({ where: { id: trackerId, status: IN_STOCK }, data: { status: INSTALLED, vehicleId } })`. If `count !== 1` → 409 "Tracker not available" (transaction rolls back).
4. Set intervention to `DONE` + `trackerId` + `completedAt = now`.
5. Write `TrackerHistory` (`IN_STOCK → INSTALLED`, action `INSTALLED`, user, vehicle, intervention).

The partial unique index on `vehicleId WHERE status = 'INSTALLED'` is the final database-level guard for race conditions.

**Rule 4 — Technician data isolation**
Technicians can never see or act on another technician's interventions. The `technicianId` filter is applied inside the service, not only the controller, so it cannot be bypassed via query parameters.

**Rule 5 — Intervention lifecycle**
Only a manager can plan an intervention. The assigned user must have role `TECHNICIAN`. The vehicle must belong to the submitted client. A manager can cancel a `PLANNED` intervention (`PLANNED → CANCELLED`). `DONE` and `CANCELLED` are final states.

**Rule 6 — No orphaned deletes**
- A client with vehicles or interventions cannot be deleted (409).
- A vehicle with linked trackers or interventions cannot be deleted (409). A vehicle carrying an `INSTALLED` tracker cannot be reassigned to a different client.
- A tracker that is not `IN_STOCK`, or that is referenced by an intervention, cannot be deleted (409).

---

## Authentication & Security

**Registration flow**
`POST /auth/register` → bcrypt hash password → create unverified user → generate 6-digit OTP → send via SMTP → return `{ message, email }`. In non-production the response also includes `devOtp` so the flow is testable without a real mail server.

`POST /auth/verify-otp` → validate OTP (match + expiry) → mark `isVerified = true` → return `{ accessToken, user }`.

**Login flow**
`POST /auth/login` → verify credentials → if unverified, resend verification OTP instead of a 401 → generate login OTP → send via SMTP → return `{ message, email }`.

`POST /auth/verify-login-otp` → validate OTP → return `{ accessToken, user }`.

OTPs expire after **10 minutes**. Each OTP is invalidated on use by setting `otp = null`.

**JWT**
Payload: `{ sub: userId, username, role }`. Secret from `JWT_SECRET` env. Expiry from `JWT_EXPIRES_IN` (default `7d`). Attached via `Authorization: Bearer <token>` header. `JwtStrategy` re-fetches the user from the database on every request to keep role changes effective immediately.

**Guards**
- `JwtAuthGuard` — validates the Bearer token.
- `RolesGuard` + `@Roles(Role.STOCK_MANAGER)` — checks the role from the JWT payload against the metadata set by the decorator. Applied at class or handler level.

**Passwords** are never included in any response. `passwordHash` is stripped in every service return path. `JwtStrategy.validate` also strips it before attaching the user to the request.

**CORS** — origin restricted to `FRONTEND_URL` env variable.

---

## Modules & API Endpoints

All protected endpoints require `Authorization: Bearer <jwt>`. Interactive docs at `GET /api/docs`.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | — | Register a new user, sends verification OTP |
| `POST` | `/auth/verify-otp` | — | Verify registration OTP, returns JWT |
| `POST` | `/auth/login` | — | Validate credentials, sends login OTP |
| `POST` | `/auth/verify-login-otp` | — | Verify login OTP, returns JWT |
| `GET` | `/auth/me` | JWT | Return the current authenticated user |

### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users` | STOCK_MANAGER | List all users, optional `?role=TECHNICIAN` filter |

### Trackers

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/trackers` | STOCK_MANAGER | Receive a new tracker (starts IN_STOCK, writes history) |
| `GET` | `/trackers` | STOCK_MANAGER | Paginated list — `?status=`, `?search=` (IMEI), `?page=`, `?limit=` |
| `GET` | `/trackers/available` | BOTH | All IN_STOCK trackers — `?search=` (IMEI) |
| `GET` | `/trackers/:id` | STOCK_MANAGER | Get one tracker with linked vehicle |
| `GET` | `/trackers/:id/history` | STOCK_MANAGER | Full audit trail for the tracker |
| `PATCH` | `/trackers/:id` | STOCK_MANAGER | Update model and/or SIM number only |
| `PATCH` | `/trackers/:id/status` | STOCK_MANAGER | Manual status change `{ status, comment? }` — enforces transition map |
| `DELETE` | `/trackers/:id` | STOCK_MANAGER | Delete only if IN_STOCK and not referenced |

### Clients

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/clients` | STOCK_MANAGER | Create client |
| `GET` | `/clients` | STOCK_MANAGER | List all — `?search=` (name or phone) |
| `GET` | `/clients/:id` | STOCK_MANAGER | Get one client with vehicles |
| `PATCH` | `/clients/:id` | STOCK_MANAGER | Update client |
| `DELETE` | `/clients/:id` | STOCK_MANAGER | Delete — 409 if vehicles or interventions exist |

### Vehicles

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/vehicles` | STOCK_MANAGER | Create vehicle — validates client exists |
| `GET` | `/vehicles` | STOCK_MANAGER | List all — `?clientId=` filter |
| `GET` | `/vehicles/:id` | STOCK_MANAGER | Get one vehicle with trackers |
| `PATCH` | `/vehicles/:id` | STOCK_MANAGER | Update — 409 if reassigning client with INSTALLED tracker |
| `DELETE` | `/vehicles/:id` | STOCK_MANAGER | Delete — 409 if trackers or interventions exist |

### Interventions

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/interventions` | STOCK_MANAGER | Plan an intervention |
| `GET` | `/interventions` | BOTH | Manager: all with filters; Technician: own only. `?status=`, `?technicianId=`, `?date=` (YYYY-MM-DD), `?all=true` |
| `GET` | `/interventions/:id` | BOTH | Get one — Technician gets 404 if not theirs |
| `PATCH` | `/interventions/:id/cancel` | STOCK_MANAGER | Cancel a PLANNED intervention |
| `POST` | `/interventions/:id/complete` | TECHNICIAN | Complete — atomically installs tracker `{ trackerId }` |

### Dashboard

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/dashboard` | STOCK_MANAGER | Aggregated stats |

Response shape:

```json
{
  "trackersByStatus": {
    "IN_STOCK": 8,
    "INSTALLED": 3,
    "FAULTY": 2,
    "RETURNED": 1
  },
  "interventionsThisWeekPerTechnician": [
    { "technicianId": "...", "fullName": "Tech One", "count": 3 }
  ],
  "inStockCount": 8,
  "lowStockThreshold": 10,
  "lowStockAlert": true
}
```

The current week is Monday 00:00 to Sunday 23:59 in local server time. The threshold is read from `LOW_STOCK_THRESHOLD` env (default `10`).

---

## Error Handling

Every response follows the same shape:

```json
{
  "statusCode": 409,
  "message": "A record with this imei already exists",
  "error": "Conflict"
}
```

The global `AllExceptionsFilter` (`src/common/filters/http-exception.filter.ts`) catches all exceptions. It calls `mapPrismaError` first to translate Prisma errors:

| Prisma code | HTTP status | Meaning |
|---|---|---|
| `P2002` | 409 Conflict | Unique constraint (IMEI, SIM, plate, username, email) |
| `P2003` | 409 Conflict | Foreign key violation — record is still referenced |
| `P2025` | 404 Not Found | Record not found during a relation lookup |

All other `HttpException` subclasses (thrown directly in services) are serialised as-is. Anything else returns 500.

Validation errors from the global `ValidationPipe` (class-validator) produce 400 with an array of messages.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.

```env
# Database
DATABASE_URL="postgresql://user:pass@host:6543/db?pgbouncer=true"  # pooled (Supabase)
DIRECT_URL="postgresql://user:pass@host:5432/db"                   # direct (for migrations)

# JWT
JWT_SECRET="change_this_super_secret_jwt_key"
JWT_EXPIRES_IN="7d"

# App
PORT="3000"
FRONTEND_URL="http://localhost:5173"         # CORS origin
LOW_STOCK_THRESHOLD="5"                      # alert fires when IN_STOCK < this value

# SMTP (OTP emails)
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_USER="you@example.com"
SMTP_PASS="your_smtp_password"
SMTP_FROM="you@example.com"
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Pooled Postgres connection string (add `?pgbouncer=true` for Supabase) |
| `DIRECT_URL` | Yes | Direct connection for `prisma migrate` (no pgbouncer) |
| `JWT_SECRET` | Yes | Secret key for signing JWTs |
| `JWT_EXPIRES_IN` | No | Token lifetime, default `7d` |
| `PORT` | No | Listening port, default `3000` |
| `FRONTEND_URL` | No | CORS allowed origin, defaults to `*` if unset |
| `LOW_STOCK_THRESHOLD` | No | Dashboard alert threshold, default `10` |
| `SMTP_HOST` | No | SMTP server hostname |
| `SMTP_PORT` | No | SMTP port (`587` for STARTTLS, `465` for SSL) |
| `SMTP_USER` | No | SMTP login |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM` | No | From address on OTP emails |

> If SMTP is not configured the email send will fail silently (logged as a warning). The OTP is still valid and returned as `devOtp` in non-production responses.

---

## Getting Started

**Prerequisites:** Node.js ≥ 18, npm ≥ 9, access to a PostgreSQL database.

### With Supabase (PostgreSQL)

```bash
# 1. Clone and install
git clone <repo-url>
cd GPS_TRACKER_Back
npm install

# 2. Configure environment
cp .env.example .env
# Fill in DATABASE_URL (pooled, ?pgbouncer=true) and DIRECT_URL (direct connection)
# Fill in JWT_SECRET, FRONTEND_URL, and SMTP_* if you want real emails

# 3. Apply migrations
npx prisma migrate deploy

# 4. Seed demo data
npm run seed

# 5. Start in development mode (watch)
npm run start:dev
# API is available at http://localhost:3000
# Swagger UI at  http://localhost:3000/api/docs
```

### With Docker Compose (local Postgres)

A `docker-compose.yml` is provided as a fallback for local development without Supabase.

```bash
# 1. Start a local Postgres container
docker compose up -d

# 2. Set the connection strings in .env
#    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/camtrack"
#    DIRECT_URL="postgresql://postgres:postgres@localhost:5432/camtrack"

# 3. Apply migrations
npx prisma migrate deploy

# 4. Seed
npm run seed

# 5. Start
npm run start:dev
```

---

## Migrations & Seed

```bash
# Apply all pending migrations (production-safe)
npx prisma migrate deploy

# Create a new migration during development
npx prisma migrate dev --name <migration_name>

# Open Prisma Studio (GUI database browser)
npx prisma studio

# Seed the database with demo data (idempotent — safe to run multiple times)
npm run seed
```

The seed creates:

| Account | Password | Role |
|---|---|---|
| `manager` | `Manager123!` | STOCK_MANAGER |
| `tech1` | `Tech123!` | TECHNICIAN |
| `tech2` | `Tech123!` | TECHNICIAN |

It also creates 3 clients, 5 vehicles, 14 trackers spread across all statuses (8 `IN_STOCK`, 4 `FAULTY`, 2 `RETURNED` — deliberately below the default threshold of 10 to trigger the low-stock alert), and 6 interventions (PLANNED, DONE, and CANCELLED).

---

## Running Tests

```bash
# Unit tests
npm test

# Unit tests with coverage
npm run test:cov

# End-to-end tests (requires a test database)
npm run test:e2e
```

The test suite covers:

1. Completing an intervention with a tracker that is not `IN_STOCK` is rejected with 409.
2. Two simultaneous completions of the same tracker — exactly one succeeds, the other gets 409, only one `INSTALLED` row and one `TrackerHistory` row exist.
3. A technician cannot see or complete another technician's intervention — gets 404.
4. Every status change writes a `TrackerHistory` row.
5. Invalid manual transition (e.g. `IN_STOCK → INSTALLED`) is rejected.
6. Login with wrong password returns 401; a technician calling a manager endpoint returns 403.

---

## Docker

The included `Dockerfile` builds a production image:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/main"]
```

```bash
# Build
docker build -t camtrack-api .

# Run (pass env vars at runtime)
docker run -p 3000:3000 \
  -e DATABASE_URL="..." \
  -e DIRECT_URL="..." \
  -e JWT_SECRET="..." \
  -e FRONTEND_URL="http://localhost:5173" \
  camtrack-api
```

---

## Test Accounts

| Username | Password | Role | Notes |
|---|---|---|---|
| `manager` | `Manager123!` | STOCK_MANAGER | Created by seed |
| `tech1` | `Tech123!` | TECHNICIAN | Created by seed, has planned interventions |
| `tech2` | `Tech123!` | TECHNICIAN | Created by seed, has planned interventions |

> Login is two-step (OTP). In non-production the API returns `devOtp` in the response body so you can log in without a real mail server.

---

## API Reference Summary

```
POST   /auth/register
POST   /auth/verify-otp
POST   /auth/login
POST   /auth/verify-login-otp
GET    /auth/me                              ← JWT required

GET    /users                                ← STOCK_MANAGER

POST   /trackers                             ← STOCK_MANAGER
GET    /trackers                             ← STOCK_MANAGER  ?status ?search ?page ?limit
GET    /trackers/available                   ← BOTH           ?search
GET    /trackers/:id                         ← STOCK_MANAGER
GET    /trackers/:id/history                 ← STOCK_MANAGER
PATCH  /trackers/:id                         ← STOCK_MANAGER
PATCH  /trackers/:id/status                  ← STOCK_MANAGER
DELETE /trackers/:id                         ← STOCK_MANAGER

POST   /clients                              ← STOCK_MANAGER
GET    /clients                              ← STOCK_MANAGER  ?search
GET    /clients/:id                          ← STOCK_MANAGER
PATCH  /clients/:id                          ← STOCK_MANAGER
DELETE /clients/:id                          ← STOCK_MANAGER

POST   /vehicles                             ← STOCK_MANAGER
GET    /vehicles                             ← STOCK_MANAGER  ?clientId
GET    /vehicles/:id                         ← STOCK_MANAGER
PATCH  /vehicles/:id                         ← STOCK_MANAGER
DELETE /vehicles/:id                         ← STOCK_MANAGER

POST   /interventions                        ← STOCK_MANAGER
GET    /interventions                        ← BOTH           ?status ?technicianId ?date ?all
GET    /interventions/:id                    ← BOTH
PATCH  /interventions/:id/cancel             ← STOCK_MANAGER
POST   /interventions/:id/complete           ← TECHNICIAN

GET    /dashboard                            ← STOCK_MANAGER
```

Full interactive documentation with request/response schemas is available at `/api/docs` (Swagger UI).

---

## What Is Done / Not Done

### Done

- Two-step OTP authentication (registration + login) with email delivery and dev-mode bypass
- JWT + `JwtAuthGuard` + `RolesGuard` + `@Roles()` decorator
- Full tracker lifecycle: creation, manual status transitions (enforced map), audit history
- Partial unique index `one_installed_tracker_per_vehicle` applied via manual migration SQL
- Atomic intervention completion in `prisma.$transaction` with concurrency-safe tracker claim
- Technician data isolation enforced at the service layer (not just the controller)
- Global exception filter with Prisma error translation (P2002/P2003 → 409, P2025 → 404)
- Global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform)
- Dashboard aggregation: tracker counts by status, per-technician weekly interventions, low-stock alert
- Idempotent seed with demo accounts, trackers across all statuses, clients, vehicles, interventions
- Swagger UI at `/api/docs` with Bearer auth
- Dockerfile for production containerisation

### Not Done / Known Limitations

- E2E tests are scaffolded but not fully implemented for all six specified scenarios
- No refresh token — JWT expiry requires re-login
- Dashboard week calculation uses server local time, not a configurable timezone
- No pagination on the dashboard's technician table
- No rate limiting on the OTP endpoints
- No soft-delete — deletes are hard (guarded by conflict checks)

---

## Possible Improvements

- Add rate limiting on `/auth/login` and `/auth/register` (e.g. `@nestjs/throttler`)
- Implement refresh tokens to avoid forcing re-login on JWT expiry
- Add a `timezone` env variable so the dashboard week boundaries are consistent across server locations
- Expand the E2E test suite to cover all six specified scenarios
- Add request logging middleware (morgan or custom NestJS middleware)
- Add a health check endpoint (`GET /health`) for container orchestration liveness probes
- Move OTP generation to a queue (BullMQ) so a slow SMTP server cannot delay the API response
