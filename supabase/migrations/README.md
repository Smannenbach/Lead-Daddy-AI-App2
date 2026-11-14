# Migrations: proposed, reviewed, applied BY HAND

The app runs on the live Base44 Supabase project `zdnlouluogpdfhygdnjn`. That database has
91 tables and is shared with the Base44 Lead Daddy app, so nothing here is applied
automatically and no deploy runs these files.

Rules:

- One new file per schema change, named `YYYYMMDDHHMMSS_description.sql`. Never edit a
  file once it has been applied.
- Changes must be additive and safe for the Base44 app: no dropped columns, no rewritten
  rows. New CHECK constraints are added `NOT VALID` so existing rows are left alone.
- Every file is tested on a throwaway local Postgres first:
  `bash scripts/test-db.sh` builds `supabase/tests/replica_schema.sql` (a read-only
  capture of the live shape), applies every migration in order, and runs `tests/db`.
- A person reviews the file, then applies it to the live project by hand (Supabase SQL
  editor), BEFORE the code that depends on it is deployed.

Status of each file is tracked in `docs/PROGRESS.md`.
