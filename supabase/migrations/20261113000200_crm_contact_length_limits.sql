-- Lead Daddy app2: max lengths on crm_contact text fields (QA: a 400 character
-- Company name saved in full).
--
-- Added NOT VALID: existing rows are NOT checked or changed; only new inserts and
-- updates must fit. The API enforces the same limits first with a plain message, so
-- these only catch writers that skip the API (for example the Base44 app).
-- Phone allows 40 here (API stores at most 16) because Base44 may store formatting.
--
-- NOT APPLIED automatically. Review, then apply by hand. Tested via scripts/test-db.sh.

begin;

alter table public.crm_contact
  add constraint chk_crm_contact_first_name_len check (char_length(first_name) <= 100) not valid,
  add constraint chk_crm_contact_last_name_len check (char_length(last_name) <= 100) not valid,
  add constraint chk_crm_contact_company_len check (char_length(company) <= 200) not valid,
  add constraint chk_crm_contact_job_title_len check (char_length(job_title) <= 150) not valid,
  add constraint chk_crm_contact_email_len check (char_length(email) <= 254) not valid,
  add constraint chk_crm_contact_phone_len check (char_length(phone) <= 40) not valid,
  add constraint chk_crm_contact_lead_source_len check (char_length(lead_source) <= 100) not valid,
  add constraint chk_crm_contact_assigned_to_len check (char_length(assigned_to) <= 254) not valid,
  add constraint chk_crm_contact_notes_len check (char_length(notes) <= 10000) not valid;

alter table public.marketing_campaign
  add constraint chk_marketing_campaign_name_len check (char_length(name) <= 200) not valid;

commit;
