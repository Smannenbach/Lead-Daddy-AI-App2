-- SECURITY: stop a logged-in user from putting themselves into any organization.
--
-- Problem (found 2026-11-13, read-only review of the live project):
--   * Supabase Auth sign-ups are open and auto-confirmed, so anyone can get a login.
--   * The public."user" INSERT and UPDATE policies only check the row's id and role.
--     Nothing stops a user from setting organization_id, and the column DEFAULT falls
--     back to the Go Buy Leads org ('e5eef388-...').
--   * Every tenant table (crm_contact, unified_lead, marketing_campaign, verification
--     tables, lead_event) grants full access when organization_id = current_user_org_id().
--   So: sign up, insert or update your own "user" row with that org id, and you can read,
--   change and delete that org's data straight through the public API.
--
-- Fix:
--   1. INSERT: a non-admin may only create their own row with NO organization, or with an
--      organization they own (organization.owner_id = them, i.e. one they just created).
--   2. UPDATE: a non-admin may not change their organization_id, except to one they own.
--   3. The column default no longer falls back to the Go Buy Leads org.
--   Super admins keep full control, so adding a teammate still works (an admin sets the
--   new teammate's organization_id, or it's done with the service key).
--
-- Side effects to check before applying:
--   * Any Base44 or leaddaddy.ai sign-up flow that relies on a new user joining an
--     existing org BY ITSELF stops working. Joining must go through an admin.
--   * Existing users are not changed.
--
-- Also do (dashboard, not SQL): Authentication > Sign In / Providers > turn off
-- "Allow new users to sign up" unless a sign-up page needs it, and delete the test
-- login qa.test.magic@example.com.
--
-- NOT APPLIED automatically. Steve reviews and applies by hand.
-- Tested on the local replica via scripts/test-db.sh (tests/db/user-org-security.test.ts).

begin;

alter table public."user" alter column organization_id set default public.current_user_org_id();

drop policy if exists user_insert_self_or_admin on public."user";
create policy user_insert_self_or_admin on public."user"
  for insert to authenticated
  with check (
    (
      id = (select auth.uid())
      and coalesce(role, 'user') = 'user'
      and (
        organization_id is null
        or exists (
          select 1 from public.organization o
          where o.id::text = organization_id
            and o.owner_id = ((select auth.uid()))::text
        )
      )
    )
    or is_super_admin()
  );

drop policy if exists user_update_self_or_admin on public."user";
create policy user_update_self_or_admin on public."user"
  for update to authenticated
  using ((id = (select auth.uid())) or is_super_admin())
  with check (
    (
      id = (select auth.uid())
      and coalesce(role, 'user') = coalesce((select u.role from public."user" u where u.id = (select auth.uid())), 'user')
      and (
        organization_id is not distinct from private_security.current_user_org_id()
        or exists (
          select 1 from public.organization o
          where o.id::text = organization_id
            and o.owner_id = ((select auth.uid()))::text
        )
      )
    )
    or is_super_admin()
  );

commit;
