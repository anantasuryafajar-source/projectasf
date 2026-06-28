# Ananta — Financial & Accounting System (Beverage Distribution ERP)

Monorepo implementation of **PRD v2.0 — Financial & Accounting System Integration (Accurate Core Engine)**.

> This project follows the PRD as its single source of truth. No requirements are
> implemented beyond what the PRD specifies without explicit approval.

## Tech Stack (per PRD §6.1)

- **Backend:** NestJS (TypeScript)
- **Database & Auth:** Supabase (PostgreSQL + Supabase Auth)
- **Frontend:** React + Vite + TailwindCSS

## Structure

```
ananta/
├── backend/          # NestJS API (journal engine, tax, inventory, AR/AP)
│   └── src/
│       └── supabase/ # Global Supabase service (service-role, server only)
├── frontend/         # React SPA (Vite + TailwindCSS)
│   └── src/
│       └── lib/      # supabaseClient.ts (anon key, browser)
├── package.json      # npm workspaces + dev/build scripts
└── PRD_Accounting_Beverage_v2.pdf
```

## Setup

1. Install dependencies (from repo root):

   ```bash
   npm install
   ```

2. Configure environment variables:

   ```bash
   cp backend/.env.example  backend/.env
   cp frontend/.env.example frontend/.env.local
   ```

   Fill in your Supabase project URL and keys.
   - Backend uses the **service role key** (bypasses RLS — server only).
   - Frontend uses the **anon public key**.

## Run (development)

```bash
npm run dev            # runs backend + frontend together
npm run dev:backend    # NestJS only  -> http://localhost:3000/api/v1
npm run dev:frontend   # React only   -> http://localhost:5173
```

## Build

```bash
npm run build          # builds both workspaces
```

## API

Base path is versioned per PRD §7: `/api/v1`.
The first specified endpoint is `POST /api/v1/sales-invoice` (not yet implemented).
