# Deployment Runbook — Ananta Accounting & ERP

Target topology (chosen): **Supabase cloud** (PostgreSQL + Auth) · **Render** (NestJS backend, Docker) · **Vercel** (React/Vite frontend).

> All artifacts in this repo are ready. Nothing has been pushed to any external
> service — every step below requires **your** credentials/accounts. Run them in
> order. Steps marked 🔑 need a secret you provide.

---

## 0. Prerequisites
- A [Supabase](https://supabase.com) account, a [Render](https://render.com) account, a [Vercel](https://vercel.com) account.
- Repo pushed to GitHub (Render + Vercel deploy from GitHub).
- Local tools: Node 22+, Docker (optional, for local image testing), Supabase CLI (`npm i -g supabase` or use the repo's dev dependency via `npx supabase`).

---

## 1. Supabase cloud — database & auth
1. Create a new project in the Supabase dashboard. Note the **Project Ref**, **Project URL** (`https://<ref>.supabase.co`), the **anon** key, and the **service_role** key (Settings → API). 🔑
2. Link the local repo to the cloud project and push all migrations:
   ```bash
   npx supabase login                 # opens browser, paste access token 🔑
   npx supabase link --project-ref <project-ref>
   npx supabase db push               # applies supabase/migrations/0001..0019
   ```
   `db push` runs every migration in order against the cloud database. The CoA
   seed (0010) is idempotent (`on conflict do nothing`), so re-runs are safe.
3. Realtime: migration `0017` adds `journal_entries`, `inventory_batches`,
   `sales_invoices` to the `supabase_realtime` publication automatically — no
   dashboard toggle needed for the dashboard live-refresh to work.
4. Create the first **owner** user. Either:
   - Dashboard → Authentication → Add user (email + password), then insert a
     matching `profiles` row with `role='owner'` (SQL editor); **or**
   - Once the backend is up, call `POST /api/v1/admin/users` (owner-only) — but
     bootstrapping the first owner must be done via the dashboard/SQL.
   ```sql
   -- after creating the auth user, copy its UUID into <auth-user-id>
   insert into profiles (id, full_name, role)
   values ('<auth-user-id>', 'Owner', 'owner');
   ```

## 2. Render — NestJS backend (Docker)
The repo ships [`render.yaml`](render.yaml) (Blueprint) and [`backend/Dockerfile`](backend/Dockerfile).
1. Render → **New → Blueprint** → select this repo. Render reads `render.yaml`,
   builds `backend/Dockerfile` with context `./backend`.
2. Fill the `sync: false` secrets when prompted: 🔑
   - `SUPABASE_URL` = `https://<ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key (server-only, bypasses RLS)
   - `FRONTEND_ORIGIN` = your Vercel URL (set after step 3; can update later).
     Comma-separate to also allow preview deploys.
   - Account-code / `VAT_RATE` vars are pre-set in `render.yaml`.
3. Deploy. Health check path is `/api/v1/` (returns 200). Note the public URL,
   e.g. `https://ananta-backend.onrender.com`. The API base is that URL + `/api/v1`.
   > Node 22 base image is required — `@supabase/supabase-js` needs a global
   > `WebSocket` at boot (Node 20 crashes). Already pinned in the Dockerfile.

## 3. Vercel — React frontend
The repo ships [`frontend/vercel.json`](frontend/vercel.json) (Vite + SPA rewrite).
1. Vercel → **New Project** → import this repo.
2. **Set Root Directory to `frontend`** (monorepo). Framework auto-detects Vite.
3. Environment Variables: 🔑
   - `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = anon public key (safe for browser)
   - `VITE_API_BASE_URL` = `https://ananta-backend.onrender.com/api/v1`
4. Deploy. Copy the resulting URL (e.g. `https://ananta.vercel.app`).

## 4. Wire CORS back
- In Render, set `FRONTEND_ORIGIN` to the Vercel URL (and any preview domains,
  comma-separated) and redeploy the backend.

## 5. Smoke test (production)
1. Open the Vercel URL, log in as the owner.
2. Dashboard loads; create a warehouse/product/customer (Master pages).
3. Stock-in → Sales invoice → Payment → Reports render.
4. Confirm reports return (Trial Balance / P&L / Balance Sheet).

---

## Security checklist (PRD §6.2)
- **TLS 1.3 in transit**: Supabase, Render, and Vercel all terminate HTTPS/TLS by
  default — no extra config. Do not expose the backend over plain HTTP.
- **AES-256 at rest**: Supabase encrypts Postgres storage at rest by default.
- **service_role key** lives only in Render env (never in the frontend bundle).
  The frontend uses the anon key + user JWT; RLS + backend guards enforce RBAC.
- **No hard delete / audit ledger / idempotency**: enforced in the database
  (migrations 0009, 0012, 0018) regardless of deploy target.

## CI/CD
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push/PR:
backend lint+build+test, frontend lint+build, and a migrations + NFR benchmark
gate (100k line items must report in < 5s). Render `autoDeploy: true` and Vercel
auto-deploy on push to the production branch after CI is green.

## Environment variable reference
| Service | Variable | Source |
|---|---|---|
| Render (backend) | `SUPABASE_URL` | Supabase Settings → API |
| Render | `SUPABASE_SERVICE_ROLE_KEY` 🔑 | Supabase Settings → API (service_role) |
| Render | `FRONTEND_ORIGIN` | Vercel deployment URL(s) |
| Render | `VAT_RATE`, `*_ACCOUNT_CODE` | pre-set in `render.yaml` |
| Vercel (frontend) | `VITE_SUPABASE_URL` | Supabase Settings → API |
| Vercel | `VITE_SUPABASE_ANON_KEY` | Supabase Settings → API (anon) |
| Vercel | `VITE_API_BASE_URL` | Render backend URL + `/api/v1` |

See [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example) for the full local lists.
