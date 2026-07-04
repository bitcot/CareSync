# CareSync AI

A POC healthcare sync app built with an Express + SQLite backend and a Vite + React frontend, communicating with a HAPI FHIR R4 server.

## Prerequisites

- Node.js (v18+)
- Docker (for the optional HAPI FHIR server)

## Setup

```bash
npm install
```

## Running the app

### Both frontend and backend together

```bash
npm run dev
```

### Separately

**Backend (Express API)** — runs on `http://localhost:4000`

```bash
npm run dev --workspace apps/api
```

**Frontend (Vite + React)** — runs on `http://localhost:5173`

```bash
npm run dev --workspace apps/web
```

### HAPI FHIR server (optional)

The API expects a FHIR server at `http://localhost:8080/fhir` (override with `FHIR_BASE_URL`). To start it:

```bash
npm run fhir:up        # docker compose up -d hapi-fhir
npm run fhir:import    # seed/import FHIR data
```

## Ports

| Service    | URL                          |
|------------|------------------------------|
| Frontend   | `http://localhost:5173`      |
| Backend    | `http://localhost:4000`      |
| HAPI FHIR  | `http://localhost:8080/fhir` |

## Other commands

| Command              | Description                          |
|----------------------|--------------------------------------|
| `npm run build`      | Build both api and web               |
| `npm run lint`       | Lint both api and web                |
| `npm run test:api`   | Run backend tests                    |
| `npm run test:web`   | Run frontend tests                   |
| `npm run test:e2e`   | Run Playwright E2E tests             |
