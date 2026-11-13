#!/usr/bin/env bash
# Runs the database tests (tests/db) against a THROWAWAY local Postgres.
# It never connects to the live Supabase project.
#
# 1. starts a temporary Postgres cluster on port 54329
# 2. builds a template database: supabase/tests/replica_schema.sql + every migration, in order
# 3. runs vitest tests/db with TEST_DATABASE_URL pointing at the template
# 4. stops and deletes the cluster
set -euo pipefail

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${TEST_PG_PORT:-54329}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
RUNAS=()
if [ "$(id -u)" = "0" ]; then RUNAS=(runuser -u postgres --); chown postgres "$WORK"; fi

cleanup() { "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUNAS[@]}" "$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=localhost" -l "$WORK/log" -w start >/dev/null

PSQL=("$PGBIN/psql" -h localhost -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "create database ld_template"
"${PSQL[@]}" -d ld_template -f "$ROOT/supabase/tests/replica_schema.sql"
"${PSQL[@]}" -d ld_template -c "create table public.migration_snapshot as select stage, count(*) n from public.crm_contact group by stage"
for f in $( [ "${SKIP_MIGRATIONS:-}" = 1 ] || ls "$ROOT"/supabase/migrations/*.sql | sort); do
  echo "applying $(basename "$f")"
  "${PSQL[@]}" -d ld_template -f "$f"
done

export TEST_DATABASE_URL="postgresql://postgres@localhost:$PORT/ld_template"
export TEST_PSQL="$PGBIN/psql"
cd "$ROOT" && npx vitest run tests/db "$@"
