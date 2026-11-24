-- Fully synthetic regression for facility approval of doctor schedule,
-- time-off and policy changes, and for single-doctor clinics leaving the join
-- list. Requires 20261114095000, 20261114096000 and 20261114100000.
-- Everything runs inside BEGIN/ROLLBACK; no provider calls.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
DO $probe$
DECLARE
  doctor_auth uuid:=gen_random_uuid(); owner_auth uuid:=gen_random_uuid(); solo_auth uuid:=gen_random_uuid();
  org uuid; hospital uuid; practice uuid; doctor_key uuid; owner_identity uuid; solo_facility uuid;
  day date:=(now() AT TIME ZONE 'UTC')::date+7; settings jsonb; result jsonb; plan jsonb;
  r1 jsonb; r2 jsonb; r3 jsonb; r4 jsonb; r5 jsonb; t1 jsonb; raised text; version_before bigint;
BEGIN
  -- Users: a doctor (phone), the hospital owner (confirmed email), a solo doctor.
  INSERT INTO auth.users(id,instance_id,aud,role,phone,phone_confirmed_at) VALUES
    (doctor_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','+919'||lpad(floor(random()*1000000000)::bigint::text,9,'0'),now()),
    (solo_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','+918'||lpad(floor(random()*1000000000)::bigint::text,9,'0'),now());
  INSERT INTO auth.users(id,instance_id,aud,role,email,email_confirmed_at) VALUES
    (owner_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-'||owner_auth||'@fixture.invalid',now());

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub',doctor_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',doctor_auth,'role','authenticated')::text,true);
  doctor_key:=(public.complete_onboarding('doctor',jsonb_build_object('full_name','Audit Approval Doctor',
    'registration_authority','Fixture Council','registration_number',doctor_auth::text,
    'practice_started_on','2020-01-01'))->'doctor'->>'id')::uuid;
  PERFORM set_config('request.jwt.claim.sub',solo_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',solo_auth,'role','authenticated')::text,true);
  PERFORM public.complete_onboarding('solo_doctor',jsonb_build_object('full_name','Audit Solo Doctor',
    'registration_authority','Fixture Council','registration_number',solo_auth::text,'practice_started_on','2020-01-01',
    'clinic_name','Audit Solo Clinic','address','1 Fixture Road, Bengaluru','latitude',12.9,'longitude',77.5));
  solo_facility:=(public.list_my_practices()->0->>'facility_id')::uuid;
  EXECUTE 'RESET ROLE';
  -- Privileged setup runs without a signed-in identity so guards do not apply.
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','{}',true);
  PERFORM clinzo.record_manual_credential_review('doctor',doctor_key,'verified','audit-dummy-reviewer','audit-synthetic-evidence');
  UPDATE clinzo.doctor SET booking_timezone='UTC' WHERE id=doctor_key;
  UPDATE clinzo.facility SET verification_status='verified' WHERE id=solo_facility;
  INSERT INTO clinzo.organization(public_code,name,kind) VALUES('ORG-'||gen_random_uuid(),'Audit Hospital Org','care_provider')
    RETURNING id INTO org;
  INSERT INTO clinzo.facility(organization_id,public_code,name,kind,address,location,timezone,verification_status)
    VALUES(org,'HSP-'||gen_random_uuid(),'Audit Hospital','hospital','2 Fixture Road, Bengaluru',
      extensions.ST_SetSRID(extensions.ST_MakePoint(77.5,12.9),4326)::extensions.geography,'UTC','verified')
    RETURNING id INTO hospital;
  INSERT INTO clinzo.identity(issuer,subject,display_name) VALUES('supabase',owner_auth::text,'Audit Hospital Owner')
    RETURNING id INTO owner_identity;
  INSERT INTO clinzo.organization_member(identity_id,organization_id,role) VALUES(owner_identity,org,'owner');
  INSERT INTO clinzo.doctor_facility(doctor_id,facility_id) VALUES(doctor_key,hospital) RETURNING id INTO practice;
  INSERT INTO clinzo.doctor_schedule_preferences(doctor_facility_id,working_days,clinic_start,clinic_end,slot_minutes,
      online_daily_limit,walkin_daily_limit,auto_accept,auto_accept_limit,home_visits,clinic_fee_minor,
      clinic_app_daily_limit,clinic_walkin_daily_limit)
    VALUES(practice,ARRAY[1,2,3,4,5,6,7]::smallint[],'09:00','12:00',30,0,12,true,10,false,50000,12,0);

  -- 1. As the doctor: approval applies and direct changes are refused.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub',doctor_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',doctor_auth,'role','authenticated')::text,true);
  IF public.schedule_change_requires_approval(practice) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hospital practice should require approval'; END IF;
  settings:=public.get_my_schedule_preferences(practice);
  version_before:=(settings->>'row_version')::bigint;
  settings:=settings||jsonb_build_object('clinic_time_blocks',
    jsonb_build_array(jsonb_build_object('start','09:00','end','11:00')));
  raised:=NULL;
  BEGIN PERFORM public.publish_doctor_schedule_from_date(practice,'clinic',settings,version_before,day);
  EXCEPTION WHEN SQLSTATE 'PT403' THEN raised:='PT403'; END;
  IF raised IS DISTINCT FROM 'PT403' THEN RAISE EXCEPTION 'Doctor published a hospital schedule directly'; END IF;
  -- Previews still work so the doctor can check a change before submitting.
  plan:=public.preview_doctor_schedule_change(practice,'clinic',settings,version_before,day);
  IF NOT plan ? 'token' THEN RAISE EXCEPTION 'Doctor preview failed'; END IF;

  -- 2. Submitting; a new submission supersedes the pending one.
  r1:=public.submit_schedule_change_request(practice,'schedule',settings,'clinic',day,version_before,'First draft');
  r2:=public.submit_schedule_change_request(practice,'schedule',settings,'clinic',day,version_before,NULL);
  IF r2->>'status'<>'pending' OR (SELECT status FROM clinzo.schedule_change_request WHERE id=(r1->>'id')::uuid)<>'superseded' THEN
    RAISE EXCEPTION 'Newer submission did not supersede the pending request'; END IF;
  IF (public.list_my_schedule_change_requests(practice)->0->>'id') IS DISTINCT FROM r2->>'id' THEN
    RAISE EXCEPTION 'Doctor list does not show the newest request first'; END IF;
  -- Time off is a request too.
  raised:=NULL;
  BEGIN PERFORM public.add_doctor_unavailability_for_services(practice,(day+1)::timestamptz+interval '10 hours',
    (day+1)::timestamptz+interval '11 hours','Conference',ARRAY['all']);
  EXCEPTION WHEN SQLSTATE 'PT403' THEN raised:='PT403'; END;
  IF raised IS DISTINCT FROM 'PT403' THEN RAISE EXCEPTION 'Doctor added hospital time off directly'; END IF;
  t1:=public.submit_schedule_change_request(practice,'time_off_add',jsonb_build_object(
    'starts_at',(day+1)::timestamptz+interval '10 hours','ends_at',(day+1)::timestamptz+interval '11 hours',
    'reason','Conference','service_modes',jsonb_build_array('all')));

  -- 3. As the owner: approval needs a reviewed preview, then applies the change.
  PERFORM set_config('request.jwt.claim.sub',owner_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_auth,'role','authenticated')::text,true);
  IF public.schedule_change_requires_approval(practice) IS NOT FALSE THEN
    RAISE EXCEPTION 'Approvers must not need approval'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_facility_schedule_change_requests('pending')) x
      WHERE x->>'id'=r2->>'id') THEN RAISE EXCEPTION 'Owner cannot see the pending request'; END IF;
  raised:=NULL;
  BEGIN PERFORM public.approve_schedule_change_request((r2->>'id')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN raised:='22023'; END;
  IF raised IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'Schedule approved without a preview'; END IF;
  plan:=public.preview_schedule_change_request((r2->>'id')::uuid);
  IF plan->>'status'<>'pending' THEN RAISE EXCEPTION 'Preview reported %',plan->>'status'; END IF;
  result:=public.approve_schedule_change_request((r2->>'id')::uuid,plan->'preview'->>'token');
  IF result->>'status'<>'approved' THEN RAISE EXCEPTION 'Approval failed: %',result; END IF;
  IF (public.get_my_schedule_preferences(practice)->'clinic_time_blocks'->0->>'end')<>'11:00' THEN
    RAISE EXCEPTION 'Approved schedule was not applied'; END IF;
  result:=public.approve_schedule_change_request((t1->>'id')::uuid);
  IF result->>'status'<>'approved' OR NOT EXISTS(SELECT 1 FROM clinzo.schedule_exception
      WHERE doctor_facility_id=practice AND state='active' AND reason='Conference') THEN
    RAISE EXCEPTION 'Approved time off was not applied'; END IF;

  -- 4. Stale: the owner changes the schedule after the doctor's request.
  PERFORM set_config('request.jwt.claim.sub',doctor_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',doctor_auth,'role','authenticated')::text,true);
  settings:=public.get_my_schedule_preferences(practice);
  r3:=public.submit_schedule_change_request(practice,'schedule',settings||jsonb_build_object('clinic_time_blocks',
    jsonb_build_array(jsonb_build_object('start','09:00','end','10:00'))),'clinic',day,(settings->>'row_version')::bigint);
  PERFORM set_config('request.jwt.claim.sub',owner_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_auth,'role','authenticated')::text,true);
  PERFORM public.publish_doctor_schedule_from_date(practice,'clinic',settings||jsonb_build_object('clinic_time_blocks',
    jsonb_build_array(jsonb_build_object('start','09:00','end','12:00'))),(settings->>'row_version')::bigint,day);
  result:=public.approve_schedule_change_request((r3->>'id')::uuid,md5('any'));
  IF result->>'status'<>'stale' OR (SELECT status FROM clinzo.schedule_change_request WHERE id=(r3->>'id')::uuid)<>'stale' THEN
    RAISE EXCEPTION 'Outdated request was not marked stale'; END IF;

  -- 5. Rejecting needs a reason; withdrawing is the requester's own.
  PERFORM set_config('request.jwt.claim.sub',doctor_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',doctor_auth,'role','authenticated')::text,true);
  settings:=public.get_my_schedule_preferences(practice);
  r4:=public.submit_schedule_change_request(practice,'schedule',settings,'clinic',day,(settings->>'row_version')::bigint);
  r5:=public.submit_schedule_change_request(practice,'recovery_policy',jsonb_build_object('online_grace_minutes',15,
    'clinic_grace_minutes',10,'reschedule_cutoff_minutes',60,'max_self_reschedules',1),NULL,NULL,(settings->>'row_version')::bigint);
  PERFORM set_config('request.jwt.claim.sub',owner_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_auth,'role','authenticated')::text,true);
  raised:=NULL;
  BEGIN PERFORM public.reject_schedule_change_request((r4->>'id')::uuid,'no');
  EXCEPTION WHEN SQLSTATE '22023' THEN raised:='22023'; END;
  IF raised IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'Rejected without a reason'; END IF;
  PERFORM public.reject_schedule_change_request((r4->>'id')::uuid,'Clinic hours are fixed this month');
  raised:=NULL;
  BEGIN PERFORM public.withdraw_schedule_change_request((r5->>'id')::uuid);
  EXCEPTION WHEN SQLSTATE '42501' THEN raised:='42501'; END;
  IF raised IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'Owner withdrew the doctor''s request'; END IF;
  PERFORM set_config('request.jwt.claim.sub',doctor_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',doctor_auth,'role','authenticated')::text,true);
  PERFORM public.withdraw_schedule_change_request((r5->>'id')::uuid);

  -- 6. Single-doctor clinics leave the join list and refuse requests.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_registered_care_facilities()) x
      WHERE (x->>'id')::uuid=solo_facility) THEN RAISE EXCEPTION 'Solo clinic is still joinable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_registered_care_facilities()) x
      WHERE (x->>'id')::uuid=hospital) THEN RAISE EXCEPTION 'Hospital is missing from the join list'; END IF;
  raised:=NULL;
  BEGIN PERFORM public.request_my_doctor_facility(solo_facility);
  EXCEPTION WHEN SQLSTATE '22023' THEN raised:='22023'; END;
  IF raised IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'Solo clinic accepted a join request'; END IF;
  EXECUTE 'RESET ROLE';

  -- 7. Statuses, notifications and audit.
  IF (SELECT status FROM clinzo.schedule_change_request WHERE id=(r4->>'id')::uuid)<>'rejected'
      OR (SELECT status FROM clinzo.schedule_change_request WHERE id=(r5->>'id')::uuid)<>'withdrawn' THEN
    RAISE EXCEPTION 'Unexpected final request statuses'; END IF;
  IF NOT EXISTS(SELECT 1 FROM clinzo.notification_intent WHERE template_key='schedule.request_approved'
        AND safe_parameters->>'request_id'=r2->>'id')
      OR NOT EXISTS(SELECT 1 FROM clinzo.notification_intent WHERE template_key='schedule.request_rejected'
        AND safe_parameters->>'request_id'=r4->>'id') THEN
    RAISE EXCEPTION 'Decision notifications are missing'; END IF;
  IF (SELECT count(*) FROM clinzo.audit_log WHERE resource_type='schedule_change_request'
      AND resource_id IN ((r2->>'id')::uuid,(r4->>'id')::uuid))<4 THEN
    RAISE EXCEPTION 'Request audit entries are missing'; END IF;
END $probe$;

-- 8. Grants: authenticated only.
DO $$
BEGIN
  IF has_function_privilege('anon','public.submit_schedule_change_request(uuid,text,jsonb,text,date,bigint,text)','EXECUTE')
    OR has_function_privilege('anon','public.approve_schedule_change_request(uuid,text,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.list_facility_schedule_change_requests(text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.approve_schedule_change_request(uuid,text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','clinzo.schedule_change_needs_approval(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Schedule request grants are wrong'; END IF;
END $$;

SELECT 'schedule change requests smoke passed' AS result;
ROLLBACK;
