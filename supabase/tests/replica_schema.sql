-- Local replica of the live crm_contact / marketing_campaign shape, captured READ-ONLY
-- from information_schema, pg_constraint, pg_trigger and pg_proc on 2026-11-13.
-- Used only by scripts/test-db.sh to test migrations on a throwaway local Postgres.
-- Never run this against the live project.

create extension if not exists pgcrypto;

create or replace function public.current_user_org_id() returns text language sql as $$ select null::text $$;

create table public.crm_contact (
  id uuid primary key default gen_random_uuid(),
  organization_id text default coalesce(current_user_org_id(), 'e5eef388-09e1-4fd4-9e93-19121d60125b'::text),
  first_name text, last_name text, email text, phone text, company text, job_title text,
  lead_source text, lead_score double precision, stage text,
  tags jsonb, custom_fields jsonb, social_profiles jsonb, communication_preferences jsonb, engagement_history jsonb,
  last_contact text, next_follow_up text, assigned_to text, estimated_value double precision, notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_crm_contact_stage check (((stage is null) or (stage = any (array['Lead'::text, 'Prospect'::text, 'Application'::text, 'Underwriting'::text, 'Approved'::text, 'Closed'::text, 'Lost'::text, 'New'::text, 'Contacted'::text, 'Nurture'::text]))))
);

create or replace function public.set_updated_date() returns trigger language plpgsql as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

create or replace function public.ensure_tenant_organization_id() returns trigger language plpgsql as $$
DECLARE
  v_user_org text;
BEGIN
  IF NEW.organization_id IS NULL OR btrim(NEW.organization_id) = '' OR NEW.organization_id = 'demo_org' THEN
    v_user_org := public.current_user_org_id();
    NEW.organization_id := COALESCE(NULLIF(btrim(v_user_org), ''), 'e5eef388-09e1-4fd4-9e93-19121d60125b');
  END IF;
  RETURN NEW;
END;
$$;

create or replace function public.normalize_crm_contact_stage() returns trigger language plpgsql as $$
BEGIN
  IF NEW.stage IS NOT NULL THEN
    CASE lower(btrim(NEW.stage))
      WHEN 'lead' THEN NEW.stage := 'Lead';
      WHEN 'prospect' THEN NEW.stage := 'Prospect';
      WHEN 'application' THEN NEW.stage := 'Application';
      WHEN 'opportunity' THEN NEW.stage := 'Application';
      WHEN 'underwriting' THEN NEW.stage := 'Underwriting';
      WHEN 'approved' THEN NEW.stage := 'Approved';
      WHEN 'closed' THEN NEW.stage := 'Closed';
      WHEN 'customer' THEN NEW.stage := 'Closed';
      WHEN 'lost' THEN NEW.stage := 'Lost';
      WHEN 'new' THEN NEW.stage := 'New';
      WHEN 'contacted' THEN NEW.stage := 'Contacted';
      WHEN 'nurture' THEN NEW.stage := 'Nurture';
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END;
$$;

create trigger crm_contact_set_updated_date before update on public.crm_contact for each row execute function set_updated_date();
create trigger trg_ensure_tenant_org_id before insert on public.crm_contact for each row execute function ensure_tenant_organization_id();
create trigger trg_normalize_crm_contact_stage before insert or update on public.crm_contact for each row execute function normalize_crm_contact_stage();

create table public.marketing_campaign (
  id uuid primary key default gen_random_uuid(),
  name text, objective text, target_audience jsonb, budget double precision, content_strategy jsonb,
  lead_capture_strategy jsonb, a_b_tests jsonb, status text, start_date text, end_date text,
  performance_metrics jsonb, created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(), organization_id text
);

-- Seed rows shaped like the live data (8 contacts: 5 New, 3 Contacted) plus every Base44 stage.
insert into public.crm_contact (first_name, email, stage) values
  ('Seed1','s1@example.com','New'),('Seed2','s2@example.com','New'),('Seed3','s3@example.com','New'),
  ('Seed4','s4@example.com','New'),('Seed5','s5@example.com','New'),
  ('Seed6','s6@example.com','Contacted'),('Seed7','s7@example.com','Contacted'),('Seed8','s8@example.com','Contacted'),
  ('Base44a',null,'Prospect'),('Base44b',null,'Underwriting'),('Base44c',null,'Closed'),('NoStage',null,null);

-- Other live tables the app writes to (columns captured read-only 2026-11-13).
create table public.lead_event (
  id uuid primary key default gen_random_uuid(), unified_lead_id text, event_type text, detail text, data jsonb,
  created_date timestamptz default now(), updated_date timestamptz default now(), organization_id text
);
create table public.unified_lead (
  id uuid primary key default gen_random_uuid(), source text, provider text, name text, email text, phone text, message text,
  page_url text, utm jsonb, consent jsonb, status text, idempotency_key text,
  created_date timestamptz default now(), updated_date timestamptz default now(), deleted_at timestamptz, organization_id text
);
create table public.email_verification (
  id uuid primary key default gen_random_uuid(), email text, verification_status text, verification_source text, verification_date text,
  created_date timestamptz default now(), updated_date timestamptz default now(), organization_id text
);

-- ── Auth + tenancy model (captured read-only 2026-11-13) ─────────────────────
-- Local stand-ins for Supabase's auth.uid() and API roles. A test "logs in" with:
--   set role authenticated; set request.jwt.claim.sub = '<uuid>';
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon;

create table public."user" (
  id uuid primary key,
  organization_id text default coalesce(current_user_org_id(), 'e5eef388-09e1-4fd4-9e93-19121d60125b'::text),
  role text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create table public.organization (
  id uuid primary key default gen_random_uuid(), name text, owner_id text, parent_organization_id text,
  created_date timestamptz not null default now(), updated_date timestamptz not null default now(),
  settings jsonb not null default '{}'::jsonb
);

create schema if not exists private_security;
create or replace function private_security.current_user_org_id() returns text
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select organization_id from public."user" where id = (select auth.uid()) limit 1;
$$;
create or replace function private_security.is_super_admin() returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select exists (select 1 from public."user" where id = (select auth.uid()) and role = 'super_admin');
$$;
create or replace function public.current_user_org_id() returns text
language sql stable set search_path to 'public', 'private_security', 'pg_temp' as $$ select private_security.current_user_org_id(); $$;
create or replace function public.is_super_admin() returns boolean
language sql stable set search_path to 'public', 'private_security', 'pg_temp' as $$ select private_security.is_super_admin(); $$;
grant usage on schema private_security to authenticated, anon;

alter table public."user" enable row level security;
alter table public.organization enable row level security;
alter table public.crm_contact enable row level security;

create policy user_insert_self_or_admin on public."user" for insert to authenticated
  with check (((id = (select auth.uid())) and (coalesce(role, 'user') = 'user')) or is_super_admin());
create policy user_select_self_or_org on public."user" for select to authenticated
  using ((id = (select auth.uid())) or (organization_id = current_user_org_id()) or is_super_admin());
create policy user_update_self_or_admin on public."user" for update to authenticated
  using ((id = (select auth.uid())) or is_super_admin())
  with check (((id = (select auth.uid())) and (coalesce(role, 'user') = coalesce((select u.role from "user" u where u.id = (select auth.uid())), 'user'))) or is_super_admin());
create policy user_delete_super_admin on public."user" for delete to authenticated using (is_super_admin());

create policy organization_insert_owner_or_admin on public.organization for insert to authenticated
  with check ((owner_id = ((select auth.uid()))::text) or is_super_admin());
create policy organization_select_tenant on public.organization for select to authenticated
  using (((id)::text = current_user_org_id()) or (owner_id = ((select auth.uid()))::text) or (parent_organization_id = current_user_org_id()) or is_super_admin());
create policy organization_update_owner_or_admin on public.organization for update to authenticated
  using ((owner_id = ((select auth.uid()))::text) or is_super_admin())
  with check ((owner_id = ((select auth.uid()))::text) or is_super_admin());

create policy tenant_isolation_policy on public.crm_contact for all to authenticated
  using ((organization_id = current_user_org_id()) or (exists (select 1 from organization o where (((o.id)::text = crm_contact.organization_id) and (o.owner_id = ((select auth.uid()))::text)))) or is_super_admin());

grant select, insert, update, delete on public."user", public.organization, public.crm_contact to authenticated;
grant insert on public."user" to anon;

-- The live org and one existing super admin member.
insert into public.organization (id, name, owner_id) values ('e5eef388-09e1-4fd4-9e93-19121d60125b', 'Go Buy Leads LLC', '00000000-0000-0000-0000-00000000a001');
insert into public."user" (id, organization_id, role) values ('00000000-0000-0000-0000-00000000a001', 'e5eef388-09e1-4fd4-9e93-19121d60125b', 'super_admin');
