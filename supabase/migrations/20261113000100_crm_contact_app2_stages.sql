-- Lead Daddy app2: allow the app2 pipeline stages on crm_contact.
--
-- Problem: app2 offers New, Contacted, Qualified, Proposal, Negotiation, Won, Lost.
-- chk_crm_contact_stage only allowed the Base44 mortgage stages plus New, Contacted, Lost,
-- so moving a lead to Qualified, Proposal, Negotiation or Won failed.
--
-- This migration is ADDITIVE ONLY:
--   * every value the old constraint allowed is still allowed, so no existing row changes;
--   * the normalize trigger keeps every old mapping and adds the four new ones.
-- The Base44 app shares this table and may now see stage values it does not know.
--
-- NOT APPLIED automatically. Review, then apply by hand to the live project.
-- Tested on a local replica via scripts/test-db.sh.

begin;

alter table public.crm_contact drop constraint if exists chk_crm_contact_stage;
alter table public.crm_contact add constraint chk_crm_contact_stage check (
  stage is null or stage = any (array[
    -- Base44 stages (unchanged)
    'Lead', 'Prospect', 'Application', 'Underwriting', 'Approved', 'Closed', 'Lost', 'New', 'Contacted', 'Nurture',
    -- app2 stages (added)
    'Qualified', 'Proposal', 'Negotiation', 'Won'
  ]::text[])
);

create or replace function public.normalize_crm_contact_stage() returns trigger
language plpgsql as $$
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
      -- app2 stages
      WHEN 'qualified' THEN NEW.stage := 'Qualified';
      WHEN 'proposal' THEN NEW.stage := 'Proposal';
      WHEN 'negotiation' THEN NEW.stage := 'Negotiation';
      WHEN 'won' THEN NEW.stage := 'Won';
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END;
$$;

commit;
