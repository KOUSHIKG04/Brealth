-- Fully synthetic regression for facility team roles: invitation links,
-- acceptance, rank rules, receptionist doctor scopes and the portal role list.
-- Requires 20261114120000. Everything runs inside BEGIN/ROLLBACK.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
DO $probe$
DECLARE
  owner_auth uuid:=gen_random_uuid(); admin_auth uuid:=gen_random_uuid(); recep_auth uuid:=gen_random_uuid();
  stranger_auth uuid:=gen_random_uuid(); doctor_auth uuid:=gen_random_uuid();
  admin_email text; recep_email text; org uuid; hospital uuid; branch uuid; owner_identity uuid;
  doctor_key uuid; practice uuid; branch_practice uuid; admin_identity uuid; recep_identity uuid;
  admin_member uuid; recep_member uuid; owner_member uuid;
  invite_admin jsonb; invite_recep jsonb; invite_org jsonb; first_link jsonb; roles jsonb; result jsonb; raised text;
BEGIN
  admin_email:='admin-'||admin_auth||'@fixture.invalid';
  recep_email:='desk-'||recep_auth||'@fixture.invalid';
  INSERT INTO auth.users(id,instance_id,aud,role,email,email_confirmed_at) VALUES
    (owner_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-'||owner_auth||'@fixture.invalid',now()),
    (admin_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',admin_email,now()),
    (recep_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',recep_email,now()),
    (stranger_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','other-'||stranger_auth||'@fixture.invalid',now());
  INSERT INTO auth.users(id,instance_id,aud,role,phone,phone_confirmed_at) VALUES
    (doctor_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','+917'||lpad(floor(random()*1000000000)::bigint::text,9,'0'),now());

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub',doctor_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',doctor_auth,'role','authenticated')::text,true);
  doctor_key:=(public.complete_onboarding('doctor',jsonb_build_object('full_name','Audit Team Doctor',
    'registration_authority','Fixture Council','registration_number',doctor_auth::text,
    'practice_started_on','2020-01-01'))->'doctor'->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','{}',true);
  PERFORM clinzo.record_manual_credential_review('doctor',doctor_key,'verified','audit-dummy-reviewer','audit-synthetic-evidence');

  -- One organization with a hospital and a second branch; the doctor practises at both.
  INSERT INTO clinzo.organization(public_code,name,kind) VALUES('ORG-'||gen_random_uuid(),'Audit Team Org','care_provider')
    RETURNING id INTO org;
  INSERT INTO clinzo.facility(organization_id,public_code,name,kind,address,location,timezone,verification_status)
    VALUES(org,'HSP-'||gen_random_uuid(),'Audit Team Hospital','hospital','3 Fixture Road, Bengaluru',
      extensions.ST_SetSRID(extensions.ST_MakePoint(77.5,12.9),4326)::extensions.geography,'UTC','verified')
    RETURNING id INTO hospital;
  INSERT INTO clinzo.facility(organization_id,public_code,name,kind,address,location,timezone,verification_status)
    VALUES(org,'CLN-'||gen_random_uuid(),'Audit Team Branch','clinic','4 Fixture Road, Bengaluru',
      extensions.ST_SetSRID(extensions.ST_MakePoint(77.6,12.9),4326)::extensions.geography,'UTC','verified')
    RETURNING id INTO branch;
  INSERT INTO clinzo.identity(issuer,subject,display_name) VALUES('supabase',owner_auth::text,'Audit Team Owner')
    RETURNING id INTO owner_identity;
  INSERT INTO clinzo.organization_member(identity_id,organization_id,role) VALUES(owner_identity,org,'owner')
    RETURNING id INTO owner_member;
  INSERT INTO clinzo.doctor_facility(doctor_id,facility_id) VALUES(doctor_key,hospital) RETURNING id INTO practice;
  INSERT INTO clinzo.doctor_facility(doctor_id,facility_id) VALUES(doctor_key,branch) RETURNING id INTO branch_practice;

  -- 1. Owner: roles, invitations and scope validation.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub',owner_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_auth,'role','authenticated')::text,true);
  roles:=public.list_my_facility_roles();
  IF jsonb_array_length(roles)<>2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(roles) x WHERE x->>'role'<>'owner') THEN
    RAISE EXCEPTION 'Owner should hold owner at both facilities: %',roles; END IF;
  raised:=NULL;
  BEGIN PERFORM public.create_member_invitation(hospital,'receptionist',recep_email,'{}');
  EXCEPTION WHEN SQLSTATE '22023' THEN raised:='22023'; END;
  IF raised IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'Receptionist invited without doctors'; END IF;
  raised:=NULL;
  BEGIN PERFORM public.create_member_invitation(hospital,'receptionist',recep_email,ARRAY[branch_practice]);
  EXCEPTION WHEN SQLSTATE '22023' THEN raised:='22023'; END;
  IF raised IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'Receptionist scoped to another facility''s doctor'; END IF;
  raised:=NULL;
  BEGIN PERFORM public.create_member_invitation(hospital,'owner',admin_email);
  EXCEPTION WHEN SQLSTATE '22023' THEN raised:='22023'; END;
  IF raised IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'Owner role was invitable'; END IF;
  first_link:=public.create_member_invitation(hospital,'facility_admin','  '||upper(admin_email)||' ');
  invite_admin:=public.create_member_invitation(hospital,'facility_admin',admin_email);
  IF (SELECT status FROM clinzo.member_invitation WHERE id=(first_link->>'id')::uuid)<>'revoked' THEN
    RAISE EXCEPTION 'A new link did not replace the earlier one'; END IF;
  IF EXISTS(SELECT 1 FROM clinzo.member_invitation WHERE id=(invite_admin->>'id')::uuid
      AND (token_hash=invite_admin->>'token' OR token_hash<>clinzo.invitation_token_hash(invite_admin->>'token'))) THEN
    RAISE EXCEPTION 'Invitation token is not stored as a hash'; END IF;
  invite_recep:=public.create_member_invitation(hospital,'receptionist',recep_email,ARRAY[practice]);
  invite_org:=public.create_member_invitation(hospital,'organization_admin','org-'||owner_auth||'@fixture.invalid');
  IF (SELECT facility_id FROM clinzo.member_invitation WHERE id=(invite_org->>'id')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'Organization admin invitation should not be facility-bound'; END IF;
  PERFORM public.revoke_member_invitation((invite_org->>'id')::uuid);
  IF jsonb_array_length(public.list_facility_team(hospital)->'invitations')<>2 THEN
    RAISE EXCEPTION 'Team list should show two pending invitations'; END IF;

  -- 2. Wrong account: preview says so and accepting is refused.
  PERFORM set_config('request.jwt.claim.sub',stranger_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',stranger_auth,'role','authenticated')::text,true);
  IF public.get_member_invitation(invite_admin->>'token')->>'status'<>'wrong_email' THEN
    RAISE EXCEPTION 'Preview did not flag the wrong account'; END IF;
  IF public.get_member_invitation(md5('not-a-token'))->>'status'<>'invalid'
      OR public.get_member_invitation(first_link->>'token')->>'status'<>'invalid' THEN
    RAISE EXCEPTION 'Unknown or replaced links should be invalid'; END IF;
  raised:=NULL;
  BEGIN PERFORM public.accept_member_invitation(invite_admin->>'token');
  EXCEPTION WHEN SQLSTATE '42501' THEN raised:='42501'; END;
  IF raised IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'Another account accepted the invitation'; END IF;

  -- 3. Facility admin joins (identity created) and sees only their facility.
  PERFORM set_config('request.jwt.claim.sub',admin_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_auth,'role','authenticated')::text,true);
  IF public.get_member_invitation(invite_admin->>'token')->>'status'<>'pending' THEN
    RAISE EXCEPTION 'Invitee preview should be pending'; END IF;
  result:=public.accept_member_invitation(invite_admin->>'token');
  IF result->>'role'<>'facility_admin' OR (result->>'facility_id')::uuid<>hospital THEN
    RAISE EXCEPTION 'Unexpected acceptance result: %',result; END IF;
  raised:=NULL;
  BEGIN PERFORM public.accept_member_invitation(invite_admin->>'token');
  EXCEPTION WHEN SQLSTATE '22023' THEN raised:='22023'; END;
  IF raised IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'An accepted link was reusable'; END IF;
  roles:=public.list_my_facility_roles();
  IF jsonb_array_length(roles)<>1 OR (roles->0->>'facility_id')::uuid<>hospital OR roles->0->>'role'<>'facility_admin' THEN
    RAISE EXCEPTION 'Facility admin roles are wrong: %',roles; END IF;
  IF (public.list_facility_team(hospital)->>'my_rank')::integer<>2 THEN RAISE EXCEPTION 'Admin rank should be 2'; END IF;
  raised:=NULL;
  BEGIN PERFORM public.list_facility_team(branch);
  EXCEPTION WHEN SQLSTATE '42501' THEN raised:='42501'; END;
  IF raised IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'Facility admin saw another branch''s team'; END IF;
  raised:=NULL;
  BEGIN PERFORM public.create_member_invitation(hospital,'facility_admin','peer-'||admin_auth||'@fixture.invalid');
  EXCEPTION WHEN SQLSTATE '42501' THEN raised:='42501'; END;
  IF raised IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'Facility admin invited an equal role'; END IF;

  -- 4. Receptionist joins with a doctor scope and cannot manage the team.
  PERFORM set_config('request.jwt.claim.sub',recep_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',recep_auth,'role','authenticated')::text,true);
  PERFORM public.accept_member_invitation(invite_recep->>'token');
  roles:=public.list_my_facility_roles();
  IF roles->0->>'role'<>'receptionist' OR roles->0->'doctor_practice_ids'<>jsonb_build_array(practice) THEN
    RAISE EXCEPTION 'Receptionist roles are wrong: %',roles; END IF;
  raised:=NULL;
  BEGIN PERFORM public.list_facility_team(hospital);
  EXCEPTION WHEN SQLSTATE '42501' THEN raised:='42501'; END;
  IF raised IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'Receptionist opened the team list'; END IF;
  -- Desk collection (cash or Razorpay) for their own doctor only.
  IF (public.get_portal_walk_in_payment_policy(practice)->>'can_collect')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Receptionist cannot collect payment for their doctor'; END IF;
  raised:=NULL;
  BEGIN PERFORM public.get_portal_walk_in_payment_policy(branch_practice);
  EXCEPTION WHEN SQLSTATE '42501' THEN raised:='42501'; END;
  IF raised IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'Receptionist reached another doctor''s payments'; END IF;
  EXECUTE 'RESET ROLE';

  SELECT id INTO admin_identity FROM clinzo.identity WHERE issuer='supabase' AND subject=admin_auth::text;
  SELECT id INTO recep_identity FROM clinzo.identity WHERE issuer='supabase' AND subject=recep_auth::text;
  SELECT id INTO admin_member FROM clinzo.organization_member WHERE identity_id=admin_identity;
  SELECT id INTO recep_member FROM clinzo.organization_member WHERE identity_id=recep_identity;
  IF admin_identity IS NULL OR recep_member IS NULL THEN RAISE EXCEPTION 'Accepted members are missing'; END IF;
  -- Receptionists collect payments for their doctors only and never edit schedules.
  IF NOT clinzo.can_manage_practice(recep_identity,practice) OR clinzo.can_manage_practice(recep_identity,branch_practice)
      OR clinzo.can_edit_practice_schedule(recep_identity,practice) THEN
    RAISE EXCEPTION 'Receptionist practice permissions are wrong'; END IF;
  -- Payout visibility stays with owners and administrators.
  IF clinzo.can_manage_appointment_practice_money(recep_identity,practice) THEN
    RAISE EXCEPTION 'Receptionist gained payout access'; END IF;
  IF NOT clinzo.can_edit_practice_schedule(admin_identity,practice) THEN
    RAISE EXCEPTION 'Facility admin should manage the hospital schedule'; END IF;

  -- 5. Facility admin: member rules.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub',admin_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_auth,'role','authenticated')::text,true);
  raised:=NULL;
  BEGIN PERFORM public.update_facility_member(admin_member,NULL,false);
  EXCEPTION WHEN SQLSTATE '22023' THEN raised:='22023'; END;
  IF raised IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'Admin changed their own access'; END IF;
  raised:=NULL;
  BEGIN PERFORM public.update_facility_member(owner_member,NULL,false);
  EXCEPTION WHEN SQLSTATE '42501' THEN raised:='42501'; END;
  IF raised IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'Admin deactivated the owner'; END IF;
  raised:=NULL;
  BEGIN PERFORM public.update_facility_member(recep_member,'facility_admin');
  EXCEPTION WHEN SQLSTATE '42501' THEN raised:='42501'; END;
  IF raised IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'Admin promoted someone to their own rank'; END IF;
  raised:=NULL;
  BEGIN PERFORM public.update_facility_member(recep_member,NULL,NULL,ARRAY[branch_practice]);
  EXCEPTION WHEN SQLSTATE '22023' THEN raised:='22023'; END;
  IF raised IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'Receptionist scoped to another facility''s doctor'; END IF;
  PERFORM public.update_facility_member(recep_member,NULL,false);
  PERFORM set_config('request.jwt.claim.sub',recep_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',recep_auth,'role','authenticated')::text,true);
  IF jsonb_array_length(public.list_my_facility_roles())<>0 THEN
    RAISE EXCEPTION 'Deactivated receptionist still has portal roles'; END IF;

  -- 6. Owner: role switches are limited to facility admin and receptionist.
  PERFORM set_config('request.jwt.claim.sub',owner_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_auth,'role','authenticated')::text,true);
  raised:=NULL;
  BEGIN PERFORM public.update_facility_member(admin_member,'organization_admin');
  EXCEPTION WHEN SQLSTATE '22023' THEN raised:='22023'; END;
  IF raised IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'Facility admin became organization admin by switch'; END IF;
  raised:=NULL;
  BEGIN PERFORM public.update_facility_member(admin_member,'receptionist');
  EXCEPTION WHEN SQLSTATE '22023' THEN raised:='22023'; END;
  IF raised IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'Switched to receptionist without doctors'; END IF;
  PERFORM public.update_facility_member(recep_member,'facility_admin',true);
  EXECUTE 'RESET ROLE';
  IF (SELECT role FROM clinzo.organization_member WHERE id=recep_member)<>'facility_admin'
      OR EXISTS(SELECT 1 FROM clinzo.member_doctor_scope WHERE member_id=recep_member AND active) THEN
    RAISE EXCEPTION 'Promotion did not clear receptionist scopes'; END IF;
  IF (SELECT count(*) FROM clinzo.audit_log WHERE resource_type='organization_member'
      AND action IN ('team.invited','team.joined','team.member_updated','team.invitation_revoked')
      AND actor_id IN (owner_identity,admin_identity,recep_identity))<8 THEN
    RAISE EXCEPTION 'Team audit entries are missing'; END IF;
END $probe$;

-- 7. Grants: authenticated only; internals stay private.
DO $$
BEGIN
  IF has_function_privilege('anon','public.create_member_invitation(uuid,text,text,uuid[])','EXECUTE')
    OR has_function_privilege('anon','public.accept_member_invitation(text)','EXECUTE')
    OR has_function_privilege('anon','public.list_my_facility_roles()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.update_facility_member(uuid,text,boolean,uuid[])','EXECUTE')
    OR has_function_privilege('authenticated','clinzo.facility_rank(uuid,uuid)','EXECUTE')
    OR has_table_privilege('authenticated','clinzo.member_invitation','SELECT') THEN
    RAISE EXCEPTION 'Team role grants are wrong'; END IF;
END $$;

SELECT 'facility team roles smoke passed' AS result;
ROLLBACK;
