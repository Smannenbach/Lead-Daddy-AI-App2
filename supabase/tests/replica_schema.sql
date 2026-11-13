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
