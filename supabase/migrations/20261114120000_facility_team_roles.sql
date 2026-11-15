-- Facility teams: invitation links, roles and receptionist doctor scopes.
-- Rank: owner (4) > organization_admin (3, every facility) > facility_admin
-- (2, one facility) > receptionist (1, one facility, assigned doctors only).
-- Nobody grants or changes a role at or above their own; owners are not
-- managed here. Dispatcher (ambulance) is out of scope.
-- Money: receptionists assigned to a doctor may collect that doctor's
-- payments (cash and desk checkout); refund decisions stay with owners,
-- administrators and the doctor.

CREATE FUNCTION clinzo.member_role_rank(p_role text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE p_role WHEN 'owner' THEN 4 WHEN 'organization_admin' THEN 3
    WHEN 'facility_admin' THEN 2 WHEN 'receptionist' THEN 1 ELSE 0 END
$$;
REVOKE ALL ON FUNCTION clinzo.member_role_rank(text) FROM PUBLIC,anon,authenticated;

-- Highest rank an identity holds at a facility (organization-wide roles count).
CREATE FUNCTION clinzo.facility_rank(p_actor uuid,p_facility uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(max(clinzo.member_role_rank(m.role)),0)
  FROM clinzo.facility f
  JOIN clinzo.organization o ON o.id=f.organization_id AND o.active
  JOIN clinzo.organization_member m ON m.organization_id=f.organization_id
    AND m.identity_id=p_actor AND m.active AND (m.facility_id IS NULL OR m.facility_id=f.id)
  WHERE f.id=p_facility AND f.active
$$;
REVOKE ALL ON FUNCTION clinzo.facility_rank(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Highest organization-wide rank (owner or organization admin).
CREATE FUNCTION clinzo.organization_rank(p_actor uuid,p_organization uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(max(clinzo.member_role_rank(m.role)),0)
  FROM clinzo.organization_member m JOIN clinzo.organization o ON o.id=m.organization_id AND o.active
  WHERE m.organization_id=p_organization AND m.identity_id=p_actor AND m.active AND m.facility_id IS NULL
$$;
REVOKE ALL ON FUNCTION clinzo.organization_rank(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION clinzo.invitation_token_hash(p_token text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT encode(sha256(convert_to(p_token,'UTF8')),'hex')
$$;
REVOKE ALL ON FUNCTION clinzo.invitation_token_hash(text) FROM PUBLIC,anon,authenticated;

CREATE TABLE clinzo.member_invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES clinzo.organization(id) ON DELETE RESTRICT,
  facility_id uuid REFERENCES clinzo.facility(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK(role IN ('organization_admin','facility_admin','receptionist')),
  email text NOT NULL CHECK(email=lower(btrim(email)) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  doctor_facility_ids uuid[] NOT NULL DEFAULT '{}',
  -- Only a hash is stored; the link token is shown once to the inviter.
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
  invited_by uuid NOT NULL REFERENCES clinzo.identity(id),
  accepted_by uuid REFERENCES clinzo.identity(id),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT member_invitation_scope_ck CHECK((role='organization_admin')=(facility_id IS NULL)),
  CONSTRAINT member_invitation_doctors_ck CHECK(role='receptionist' OR cardinality(doctor_facility_ids)=0)
);
CREATE INDEX member_invitation_organization_idx ON clinzo.member_invitation(organization_id,status);
ALTER TABLE clinzo.member_invitation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clinzo.member_invitation FROM PUBLIC,anon,authenticated;

CREATE FUNCTION clinzo.audit_team_change(p_actor uuid,p_action text,p_resource uuid,p_facility uuid,p_metadata jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  INSERT INTO clinzo.audit_log(actor_id,actor_kind,action,resource_type,resource_id,facility_id,request_id,outcome,metadata)
  VALUES(p_actor,'identity',p_action,'organization_member',p_resource,p_facility,gen_random_uuid(),'allowed',
    coalesce(p_metadata,'{}'::jsonb))
$$;
REVOKE ALL ON FUNCTION clinzo.audit_team_change(uuid,text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;

-- Doctors a receptionist may serve must practise at that facility.
CREATE FUNCTION clinzo.valid_receptionist_scope(p_facility uuid,p_practices uuid[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT cardinality(coalesce(p_practices,'{}'))>0 AND NOT EXISTS(
    SELECT 1 FROM unnest(p_practices) s WHERE NOT EXISTS(
      SELECT 1 FROM clinzo.doctor_facility p WHERE p.id=s AND p.facility_id=p_facility AND p.active))
$$;
REVOKE ALL ON FUNCTION clinzo.valid_receptionist_scope(uuid,uuid[]) FROM PUBLIC,anon,authenticated;

-- 1. The signed-in portal user's roles, which the portal uses to adapt itself.
CREATE FUNCTION public.list_my_facility_roles() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_portal_identity();
BEGIN
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'facility_id',x.id,'facility_name',x.name,'facility_kind',x.kind,'role',x.role,
      'doctor_practice_ids',x.scopes) ORDER BY x.name,x.id),'[]'::jsonb)
    FROM (SELECT f.id,f.name,f.kind,
        (array_agg(m.role ORDER BY clinzo.member_role_rank(m.role) DESC))[1] AS role,
        coalesce((SELECT jsonb_agg(DISTINCT s.doctor_facility_id) FROM clinzo.member_doctor_scope s
          JOIN clinzo.organization_member r ON r.id=s.member_id
          WHERE r.identity_id=actor AND r.active AND r.role='receptionist' AND r.facility_id=f.id AND s.active),
          '[]'::jsonb) AS scopes
      FROM clinzo.facility f
      JOIN clinzo.organization o ON o.id=f.organization_id
      JOIN clinzo.organization_member m ON m.organization_id=o.id
      WHERE m.identity_id=actor AND m.active AND f.active AND o.active
        AND (m.facility_id IS NULL OR m.facility_id=f.id)
        AND m.role IN ('owner','organization_admin','facility_admin','receptionist')
        AND o.kind IN ('care_provider','mixed')
      GROUP BY f.id,f.name,f.kind) x);
END $$;
REVOKE ALL ON FUNCTION public.list_my_facility_roles() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_facility_roles() TO authenticated;

-- 2. Team list for facility owners and administrators.
CREATE FUNCTION public.list_facility_team(p_facility_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_portal_identity(); f clinzo.facility; rank integer;
BEGIN
  SELECT * INTO f FROM clinzo.facility WHERE id=p_facility_id AND active;
  rank:=clinzo.facility_rank(actor,p_facility_id);
  IF f.id IS NULL OR rank<2 THEN
    RAISE EXCEPTION 'Facility owner or administrator required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('my_rank',rank,
    'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'role',m.role,'active',m.active,
        'facility_id',m.facility_id,'name',i.display_name,'email',u.email,'is_self',m.identity_id=actor,
        'doctor_practice_ids',(SELECT coalesce(jsonb_agg(s.doctor_facility_id),'[]'::jsonb)
          FROM clinzo.member_doctor_scope s WHERE s.member_id=m.id AND s.active))
        ORDER BY clinzo.member_role_rank(m.role) DESC,i.display_name),'[]'::jsonb)
      FROM clinzo.organization_member m
      JOIN clinzo.identity i ON i.id=m.identity_id
      LEFT JOIN auth.users u ON i.issuer='supabase' AND i.subject=u.id::text
      WHERE m.organization_id=f.organization_id AND (m.facility_id IS NULL OR m.facility_id=f.id)
        AND m.role IN ('owner','organization_admin','facility_admin','receptionist')),
    'invitations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'role',v.role,'email',v.email,
        'expires_at',v.expires_at,'doctor_practice_ids',to_jsonb(v.doctor_facility_ids))
        ORDER BY v.created_at DESC),'[]'::jsonb)
      FROM clinzo.member_invitation v
      WHERE v.organization_id=f.organization_id AND (v.facility_id IS NULL OR v.facility_id=f.id)
        AND v.status='pending' AND v.expires_at>now()));
END $$;
REVOKE ALL ON FUNCTION public.list_facility_team(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_facility_team(uuid) TO authenticated;

-- 3. Invitation links (valid 7 days, bound to the invited email).
CREATE FUNCTION public.create_member_invitation(
  p_facility_id uuid,p_role text,p_email text,p_doctor_practice_ids uuid[] DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_portal_identity(); f clinzo.facility; token text; invite clinzo.member_invitation;
  invite_email text:=lower(btrim(coalesce(p_email,''))); scopes uuid[]:=coalesce(p_doctor_practice_ids,'{}');
BEGIN
  SELECT * INTO f FROM clinzo.facility WHERE id=p_facility_id AND active;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Facility not found' USING ERRCODE='22023'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('organization_admin','facility_admin','receptionist') THEN
    RAISE EXCEPTION 'Choose a role' USING ERRCODE='22023'; END IF;
  IF (CASE WHEN p_role='organization_admin' THEN clinzo.organization_rank(actor,f.organization_id)
      ELSE clinzo.facility_rank(actor,f.id) END)<=clinzo.member_role_rank(p_role) THEN
    RAISE EXCEPTION 'You cannot invite someone to this role' USING ERRCODE='42501'; END IF;
  IF invite_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE='22023'; END IF;
  IF p_role<>'receptionist' THEN scopes:='{}';
  ELSIF NOT clinzo.valid_receptionist_scope(f.id,scopes) THEN
    RAISE EXCEPTION 'Choose the doctors this receptionist will work with' USING ERRCODE='22023'; END IF;
  -- A new link replaces any earlier pending link for the same person.
  UPDATE clinzo.member_invitation SET status='revoked'
    WHERE organization_id=f.organization_id AND email=invite_email AND status='pending';
  token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  INSERT INTO clinzo.member_invitation(organization_id,facility_id,role,email,doctor_facility_ids,token_hash,invited_by)
    VALUES(f.organization_id,CASE WHEN p_role='organization_admin' THEN NULL ELSE f.id END,p_role,invite_email,
      scopes,clinzo.invitation_token_hash(token),actor)
    RETURNING * INTO invite;
  PERFORM clinzo.audit_team_change(actor,'team.invited',invite.id,f.id,
    jsonb_build_object('role',p_role,'doctor_count',cardinality(scopes)));
  RETURN jsonb_build_object('id',invite.id,'token',token,'expires_at',invite.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.create_member_invitation(uuid,text,text,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_member_invitation(uuid,text,text,uuid[]) TO authenticated;

CREATE FUNCTION public.revoke_member_invitation(p_invitation_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_portal_identity(); v clinzo.member_invitation;
BEGIN
  SELECT * INTO v FROM clinzo.member_invitation WHERE id=p_invitation_id FOR UPDATE;
  IF v.id IS NULL OR v.status<>'pending' OR (CASE WHEN v.facility_id IS NULL
      THEN clinzo.organization_rank(actor,v.organization_id)
      ELSE clinzo.facility_rank(actor,v.facility_id) END)<=clinzo.member_role_rank(v.role) THEN
    RAISE EXCEPTION 'Pending invitation not found' USING ERRCODE='42501'; END IF;
  UPDATE clinzo.member_invitation SET status='revoked' WHERE id=v.id;
  PERFORM clinzo.audit_team_change(actor,'team.invitation_revoked',v.id,v.facility_id,jsonb_build_object('role',v.role));
END $$;
REVOKE ALL ON FUNCTION public.revoke_member_invitation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_member_invitation(uuid) TO authenticated;

-- What a signed-in invitee is about to accept (no change is made).
CREATE FUNCTION public.get_member_invitation(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v clinzo.member_invitation; user_email text;
BEGIN
  SELECT lower(u.email) INTO user_email FROM auth.users u WHERE u.id=auth.uid();
  IF user_email IS NULL THEN RAISE EXCEPTION 'Sign in to view this invitation' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM clinzo.member_invitation WHERE token_hash=clinzo.invitation_token_hash(coalesce(p_token,''));
  IF v.id IS NULL OR v.status<>'pending' OR v.expires_at<=now() THEN
    RETURN jsonb_build_object('status','invalid'); END IF;
  RETURN jsonb_build_object('status',CASE WHEN v.email=user_email THEN 'pending' ELSE 'wrong_email' END,
    'role',v.role,'organization_name',(SELECT o.name FROM clinzo.organization o WHERE o.id=v.organization_id),
    'facility_name',(SELECT f.name FROM clinzo.facility f WHERE f.id=v.facility_id),
    'invited_email',v.email,'expires_at',v.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.get_member_invitation(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_invitation(text) TO authenticated;

CREATE FUNCTION public.accept_member_invitation(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE auth_user uuid:=auth.uid(); user_email text; actor uuid; v clinzo.member_invitation;
  member_key uuid; scope uuid;
BEGIN
  SELECT lower(u.email) INTO user_email FROM auth.users u WHERE u.id=auth_user
    AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<now());
  IF user_email IS NULL THEN
    RAISE EXCEPTION 'Sign in with a confirmed email account to accept this invitation' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM clinzo.member_invitation
    WHERE token_hash=clinzo.invitation_token_hash(coalesce(p_token,'')) FOR UPDATE;
  IF v.id IS NULL OR v.status<>'pending' OR v.expires_at<=now() THEN
    RAISE EXCEPTION 'This invitation is invalid or has expired. Ask for a new link.' USING ERRCODE='22023'; END IF;
  IF v.email<>user_email THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address' USING ERRCODE='42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth_user::text,0));
  SELECT i.id INTO actor FROM clinzo.identity i
    WHERE i.issuer='supabase' AND i.subject=auth_user::text AND i.disabled_at IS NULL;
  IF actor IS NULL THEN
    INSERT INTO clinzo.identity(issuer,subject,display_name)
      VALUES('supabase',auth_user::text,split_part(user_email,'@',1)) RETURNING id INTO actor;
  END IF;
  INSERT INTO clinzo.organization_member(identity_id,organization_id,facility_id,role)
    VALUES(actor,v.organization_id,v.facility_id,v.role)
    ON CONFLICT ON CONSTRAINT organization_member_uq_1 DO UPDATE SET active=true,updated_at=now()
    RETURNING id INTO member_key;
  FOREACH scope IN ARRAY v.doctor_facility_ids LOOP
    INSERT INTO clinzo.member_doctor_scope(member_id,doctor_facility_id) VALUES(member_key,scope)
      ON CONFLICT(member_id,doctor_facility_id) DO UPDATE SET active=true,updated_at=now();
  END LOOP;
  UPDATE clinzo.member_invitation SET status='accepted',accepted_by=actor,accepted_at=now() WHERE id=v.id;
  PERFORM clinzo.audit_team_change(actor,'team.joined',member_key,v.facility_id,jsonb_build_object('role',v.role));
  RETURN jsonb_build_object('organization_id',v.organization_id,'facility_id',v.facility_id,'role',v.role);
END $$;
REVOKE ALL ON FUNCTION public.accept_member_invitation(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.accept_member_invitation(text) TO authenticated;

-- 4. Change a member: deactivate/reactivate, switch between facility admin
-- and receptionist, or update a receptionist's doctors.
CREATE FUNCTION public.update_facility_member(
  p_member_id uuid,p_role text DEFAULT NULL,p_active boolean DEFAULT NULL,p_doctor_practice_ids uuid[] DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_portal_identity(); m clinzo.organization_member; actor_rank integer;
  new_role text; scope uuid;
BEGIN
  SELECT * INTO m FROM clinzo.organization_member WHERE id=p_member_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Member not found' USING ERRCODE='42501'; END IF;
  IF m.identity_id=actor THEN RAISE EXCEPTION 'You cannot change your own access' USING ERRCODE='22023'; END IF;
  actor_rank:=CASE WHEN m.facility_id IS NULL THEN clinzo.organization_rank(actor,m.organization_id)
    ELSE clinzo.facility_rank(actor,m.facility_id) END;
  IF actor_rank<=clinzo.member_role_rank(m.role) THEN
    RAISE EXCEPTION 'You cannot change this member' USING ERRCODE='42501'; END IF;
  new_role:=coalesce(p_role,m.role);
  IF new_role<>m.role THEN
    IF m.facility_id IS NULL OR m.role NOT IN ('facility_admin','receptionist')
        OR new_role NOT IN ('facility_admin','receptionist') THEN
      RAISE EXCEPTION 'Only facility admins and receptionists can switch roles. Send a new invitation for other roles.'
        USING ERRCODE='22023'; END IF;
    IF actor_rank<=clinzo.member_role_rank(new_role) THEN
      RAISE EXCEPTION 'You cannot grant this role' USING ERRCODE='42501'; END IF;
  END IF;
  IF new_role='receptionist' AND p_doctor_practice_ids IS NOT NULL
      AND NOT clinzo.valid_receptionist_scope(m.facility_id,p_doctor_practice_ids) THEN
    RAISE EXCEPTION 'Choose the doctors this receptionist will work with' USING ERRCODE='22023'; END IF;
  IF new_role='receptionist' AND m.role<>'receptionist' AND p_doctor_practice_ids IS NULL THEN
    RAISE EXCEPTION 'Choose the doctors this receptionist will work with' USING ERRCODE='22023'; END IF;
  UPDATE clinzo.organization_member SET role=new_role,active=coalesce(p_active,active),
    updated_at=now(),row_version=row_version+1 WHERE id=m.id;
  IF new_role<>'receptionist' THEN
    UPDATE clinzo.member_doctor_scope SET active=false,updated_at=now() WHERE member_id=m.id AND active;
  ELSIF p_doctor_practice_ids IS NOT NULL THEN
    UPDATE clinzo.member_doctor_scope SET active=(doctor_facility_id=ANY(p_doctor_practice_ids)),updated_at=now()
      WHERE member_id=m.id;
    FOREACH scope IN ARRAY p_doctor_practice_ids LOOP
      INSERT INTO clinzo.member_doctor_scope(member_id,doctor_facility_id) VALUES(m.id,scope)
        ON CONFLICT(member_id,doctor_facility_id) DO UPDATE SET active=true,updated_at=now();
    END LOOP;
  END IF;
  PERFORM clinzo.audit_team_change(actor,'team.member_updated',m.id,m.facility_id,
    jsonb_build_object('from_role',m.role,'to_role',new_role,'active',coalesce(p_active,m.active)));
END $$;
REVOKE ALL ON FUNCTION public.update_facility_member(uuid,text,boolean,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_facility_member(uuid,text,boolean,uuid[]) TO authenticated;

-- 5. Money. Receptionists assigned to the doctor join the existing practice
-- managers for collecting payments (cash, desk checkout, billing view).
CREATE OR REPLACE FUNCTION clinzo.can_manage_appointment_money(actor uuid,appointment_key uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(clinzo.can_manage_practice(actor,s.doctor_facility_id),false)
 FROM clinzo.appointment a JOIN clinzo.session s ON s.id=a.session_id WHERE a.id=appointment_key;
$$;

-- Walk-in booking: anyone who manages the practice (receptionists included)
-- may collect at the desk. Payout visibility keeps the stricter
-- can_manage_appointment_practice_money check, which is unchanged.
CREATE OR REPLACE FUNCTION public.get_portal_walk_in_payment_policy(p_practice_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_care_actor(); cfg clinzo.appointment_billing_config;
BEGIN
  IF NOT coalesce(clinzo.can_manage_practice(actor,p_practice_id),false) THEN
    RAISE EXCEPTION 'Practice access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO cfg FROM clinzo.appointment_billing_config WHERE singleton;
  RETURN jsonb_build_object('enabled',cfg.enabled,'mode',cfg.mode,'policy_version',cfg.policy_version,
    'can_collect',true,
    'policy_text',format('Paid credit follows a rescheduled booking. Higher fees require an additional payment; unused credit can be refunded. Cancellation refunds require clinic review. The accepted deduction is %s%%; doctor unavailability has no deduction. Refunds return to the original payment method.',trim_scale(cfg.deduction_bps::numeric/100)));
END $$;

-- Refund decisions and cash refunds stay with owners, administrators and the
-- doctor: a receptionist-only member cannot approve, reject or settle one.
CREATE FUNCTION clinzo.guard_refund_decision_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; practice uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('approved','rejected','refunded') THEN
    RETURN NEW; END IF;
  actor:=clinzo.current_identity();
  IF actor IS NULL THEN RETURN NEW; END IF;
  SELECT s.doctor_facility_id INTO practice FROM clinzo.appointment_charge c
    JOIN clinzo.appointment a ON a.id=c.appointment_id JOIN clinzo.session s ON s.id=a.session_id
    WHERE c.id=NEW.charge_id;
  IF practice IS NOT NULL AND coalesce(clinzo.can_manage_practice(actor,practice),false)
      AND NOT coalesce(clinzo.can_edit_practice_schedule(actor,practice),false) THEN
    RAISE EXCEPTION 'Refunds are decided by facility owners and administrators' USING ERRCODE='PT403';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION clinzo.guard_refund_decision_role() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_refund_decision_role BEFORE UPDATE ON clinzo.appointment_refund_request
  FOR EACH ROW EXECUTE FUNCTION clinzo.guard_refund_decision_role();
