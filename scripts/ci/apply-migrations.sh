#!/usr/bin/env bash
# Apply the Supabase-compat stub + all production migrations to $DATABASE_URL.
# Usage: DATABASE_URL=postgres://user:pass@host:port/db ./scripts/ci/apply-migrations.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo ">> applying compatibility stub"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/scripts/ci/stub.sql"

echo ">> applying migrations"
for f in "$ROOT"/supabase/migrations/0*.sql; do
  echo "   - $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

echo ">> all migrations applied cleanly"
