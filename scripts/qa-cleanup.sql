-- Lead Daddy app2: remove the test data the QA pass left in the live account.
--
-- DO NOT RUN THIS UNTIL A PERSON HAS APPROVED THE LIST FROM STEP 1.
-- Run in the Supabase SQL editor for project zdnlouluogpdfhygdnjn, one step at a time.
--
-- Matching rule (both must hold for a lead):
--   * first_name starts with "QA TEST", and
--   * email is on example.com, or there is no email and no phone (the text-file lead).
-- Campaign: name starts with "QA TEST".
--
-- Read-only preview taken 2026-11-13 (8 leads, 1 campaign):
--   492c6f9a-f9d1-4392-96e8-5bf0492ef92e  QA TEST Alpha2 Tester2   qa.test.alpha2@example.com
--   a111fd84-64aa-4b39-8172-fdb78824e3c0  QA TEST Bravo Csv        qa.test.bravo@example.com
--   a3655cec-de4e-421e-b284-d90882bf0ab8  QA TEST Charlie Csv      qa.test.charlie@example.com
--   da1bb621-543e-479b-98c3-0ab6b1238a8c  QA TEST Dupe Csv         qa.test.bravo@example.com
--   ad78c21b-b700-4dd1-aaa8-d485f321a0c4  QA TEST Delta NoHeader   qa.test.delta@example.com
--   0e94d6dd-989c-4454-8f9d-9855b0873af2  QA TEST Echo NoHeader    qa.test.echo@example.com
--   e2b720db-de08-4aa6-8bf0-59ec8ca86885  QA TEST Foxtrot Form     qa.test.foxtrot@example.com
--   03833dd0-0ae9-4a27-92ea-663171857446  "QA TEST this is not a csv file. Just plain text."  (no email, no phone)
--   9621c5c8-286c-4c6d-8c9c-5b51d2c7db16  QA TEST Campaign (draft)
-- NOTE: at preview time these 8 were the ONLY leads in this org.

-- ── STEP 1: preview. Read only. Check the list matches the one above. ─────────
select id, first_name, last_name, email, phone, lead_source, created_date
from public.crm_contact
where organization_id = 'e5eef388-09e1-4fd4-9e93-19121d60125b'
  and deleted_at is null
  and first_name ilike 'QA TEST%'
  and (email ilike '%@example.com' or (email is null and phone is null))
order by created_date;

select id, name, status from public.marketing_campaign
where organization_id = 'e5eef388-09e1-4fd4-9e93-19121d60125b' and name ilike 'QA TEST%';

-- ── STEP 2: soft delete (same as the app's Delete). Only the approved IDs. ────
-- Uses the explicit ID list, so nothing else can be caught by the pattern.
begin;

update public.crm_contact
set deleted_at = now(),
    engagement_history = coalesce(engagement_history, '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('type', 'system', 'at', now(), 'by', 'qa-cleanup', 'detail', 'Lead deleted (QA test data cleanup)'))
where organization_id = 'e5eef388-09e1-4fd4-9e93-19121d60125b'
  and deleted_at is null
  and id in (
    '492c6f9a-f9d1-4392-96e8-5bf0492ef92e', 'a111fd84-64aa-4b39-8172-fdb78824e3c0',
    'a3655cec-de4e-421e-b284-d90882bf0ab8', 'da1bb621-543e-479b-98c3-0ab6b1238a8c',
    'ad78c21b-b700-4dd1-aaa8-d485f321a0c4', '0e94d6dd-989c-4454-8f9d-9855b0873af2',
    'e2b720db-de08-4aa6-8bf0-59ec8ca86885', '03833dd0-0ae9-4a27-92ea-663171857446'
  )
returning id, first_name, last_name;   -- expect 8 rows

update public.marketing_campaign
set status = 'deleted',
    updated_date = now(),
    target_audience = coalesce(target_audience, '{}'::jsonb)
      || jsonb_build_object('deleted_at', now(), 'status_before_delete', status)
where organization_id = 'e5eef388-09e1-4fd4-9e93-19121d60125b'
  and id = '9621c5c8-286c-4c6d-8c9c-5b51d2c7db16'
returning id, name;                     -- expect 1 row

insert into public.lead_event (event_type, detail, data, organization_id, created_date, updated_date)
values ('qa_cleanup', 'QA test data soft deleted', jsonb_build_object('leads', 8, 'campaigns', 1),
        'e5eef388-09e1-4fd4-9e93-19121d60125b', now(), now());

-- If the row counts above are not 8 and 1: ROLLBACK; and stop.
commit;

-- ── STEP 3 (optional): the form submission copy and verification rows. ────────
-- The public form also wrote one unified_lead row; QA verify runs wrote rows to
-- email_verification. These are test data on example.com. Preview, then delete:
--   select id, email from public.unified_lead       where organization_id = 'e5eef388-09e1-4fd4-9e93-19121d60125b' and email ilike 'qa.test.%@example.com';
--   select id, email from public.email_verification where organization_id = 'e5eef388-09e1-4fd4-9e93-19121d60125b' and email ilike 'qa.test.%@example.com';
--   delete from public.unified_lead       where organization_id = 'e5eef388-09e1-4fd4-9e93-19121d60125b' and email ilike 'qa.test.%@example.com';
--   delete from public.email_verification where organization_id = 'e5eef388-09e1-4fd4-9e93-19121d60125b' and email ilike 'qa.test.%@example.com';
