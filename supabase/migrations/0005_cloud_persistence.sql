-- Additive document storage preserves the complete existing repository payload,
-- including evidence timestamps, hashes, alternatives, metadata and audits.
BEGIN;
CREATE TABLE public.household_records (
 id uuid PRIMARY KEY, owner_id text NOT NULL, record jsonb NOT NULL,
 revision bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.household_locks (id uuid PRIMARY KEY, token uuid NOT NULL);
CREATE TABLE public.household_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record jsonb NOT NULL
);
CREATE TABLE public.household_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid,
 leg_id text, idempotency_key text UNIQUE, record jsonb NOT NULL
);
CREATE TABLE portal.captcha_nonces (nonce text PRIMARY KEY, expires_at timestamptz NOT NULL);
ALTER TABLE portal.failure_switches ADD COLUMN hide_fee_info boolean NOT NULL DEFAULT false,
 ADD COLUMN raise_fee boolean NOT NULL DEFAULT false,
 ADD COLUMN hide_review_fee boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.household_lock(p_id uuid, p_token uuid, p_release boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 IF p_release THEN
  DELETE FROM public.household_locks WHERE id=p_id AND token=p_token;
  RETURN FOUND;
 END IF;
 INSERT INTO public.household_locks VALUES(p_id,p_token) ON CONFLICT DO NOTHING;
 RETURN FOUND;
END $$;

CREATE FUNCTION public.household_save(p_record jsonb, p_revision bigint DEFAULT NULL, p_token uuid DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_id uuid := (p_record#>>'{request,id}')::uuid; v_old public.household_records;
 v_lock uuid; v_revision bigint; v_leg jsonb; v_policy jsonb;
BEGIN
 -- Serialize first insert as well as updates, including writers without a lease.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_id::text,0));
 SELECT token INTO v_lock FROM public.household_locks WHERE id=v_id;
 IF v_lock IS NOT NULL AND v_lock IS DISTINCT FROM p_token THEN RAISE EXCEPTION 'BUSY: request locked'; END IF;
 SELECT * INTO v_old FROM public.household_records WHERE id=v_id FOR UPDATE;
 IF FOUND THEN
  IF v_old.owner_id IS DISTINCT FROM p_record#>>'{request,userId}' THEN RAISE EXCEPTION 'OWNERSHIP_DENIED'; END IF;
  IF p_revision IS DISTINCT FROM v_old.revision AND v_lock IS NULL THEN RAISE EXCEPTION 'STALE: revision changed'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(v_old.record#>'{plan,legs}','[]'::jsonb)) l WHERE l->>'state' NOT IN ('APPROVED','REJECTED'))
   AND (v_old.record#>>'{plan,planHash}' IS DISTINCT FROM p_record#>>'{plan,planHash}' OR v_old.record#>>'{request,state}' IS DISTINCT FROM p_record#>>'{request,state}') THEN RAISE EXCEPTION 'STALE: booking already started'; END IF;
 END IF;
 -- Recheck expiry at the database transition, not just in the web process.
 IF (p_record#>>'{request,state}'='APPROVED' AND v_old.record#>>'{request,state}' IS DISTINCT FROM 'APPROVED')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_record#>'{plan,legs}','[]'::jsonb)) l
   WHERE l->>'state'='SUBMITTING' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(v_old.record#>'{plan,legs}','[]'::jsonb)) old WHERE old->>'id'=l->>'id' AND old->>'state'='SUBMITTING')) THEN
  IF p_record#>>'{approval,decision}' IS DISTINCT FROM 'approved' OR p_record#>>'{approval,planHash}' IS DISTINCT FROM p_record#>>'{plan,planHash}' THEN RAISE EXCEPTION 'STALE: approval hash mismatch'; END IF;
  IF p_record#>>'{household,policyMode}' IS DISTINCT FROM 'fixture' THEN
   FOR v_leg IN SELECT * FROM jsonb_array_elements(p_record#>'{plan,legs}') LOOP
    SELECT p INTO v_policy FROM jsonb_array_elements(coalesce(p_record#>'{household,policies}','[]'::jsonb)) p WHERE p->>'recyclerId'=v_leg->>'recyclerId';
    IF v_policy IS NULL OR v_policy->>'status' IS DISTINCT FROM 'SUCCESS' OR coalesce(v_policy->>'provenance','') NOT IN ('live','cached') OR (v_policy->>'expiresAt')::timestamptz IS NULL OR (v_policy->>'expiresAt')::timestamptz <= now() THEN RAISE EXCEPTION 'STALE: policy evidence expired'; END IF;
   END LOOP;
  ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(p_record#>'{plan,legs}') l WHERE l->>'state'='SUBMITTING') THEN RAISE EXCEPTION 'STALE: fixture booking prohibited';
  END IF;
 END IF;
 INSERT INTO public.household_records(id,owner_id,record) VALUES(v_id,p_record#>>'{request,userId}',p_record - 'revision')
 ON CONFLICT(id) DO UPDATE SET record=excluded.record,revision=household_records.revision+1,updated_at=now()
 RETURNING revision INTO v_revision;
 RETURN v_revision;
END $$;

CREATE FUNCTION public.household_claim_action(p_record jsonb,p_key text) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_doc jsonb; v_leg jsonb; v_policy jsonb;
BEGIN
 SELECT record INTO STRICT v_doc FROM public.household_records WHERE id=(p_record->>'requestId')::uuid FOR UPDATE;
 IF v_doc#>>'{request,state}' IS DISTINCT FROM 'APPROVED' OR v_doc#>>'{approval,decision}' IS DISTINCT FROM 'approved'
 OR v_doc#>>'{approval,planHash}' IS DISTINCT FROM p_record->>'planHash' OR v_doc#>>'{plan,planHash}' IS DISTINCT FROM p_record->>'planHash' THEN RAISE EXCEPTION 'STALE: action approval mismatch'; END IF;
 SELECT l INTO v_leg FROM jsonb_array_elements(v_doc#>'{plan,legs}') l WHERE l->>'id'=p_record->>'legId';
 IF v_leg IS NULL OR v_leg->>'state' IS DISTINCT FROM 'SUBMITTING' OR v_doc#>>'{household,policyMode}'='fixture' THEN RAISE EXCEPTION 'STALE: action state'; END IF;
 SELECT p INTO v_policy FROM jsonb_array_elements(coalesce(v_doc#>'{household,policies}','[]'::jsonb)) p WHERE p->>'recyclerId'=v_leg->>'recyclerId';
 IF v_policy IS NULL OR v_policy->>'status' IS DISTINCT FROM 'SUCCESS' OR coalesce(v_policy->>'provenance','') NOT IN ('live','cached') OR coalesce((v_policy->>'expiresAt')::timestamptz,'-infinity'::timestamptz)<=now() THEN RAISE EXCEPTION 'STALE: action evidence expired'; END IF;
 INSERT INTO public.household_actions(request_id,leg_id,idempotency_key,record) VALUES((p_record->>'requestId')::uuid,p_record->>'legId',p_key,p_record);
END $$;

CREATE FUNCTION public.household_dequeue(p_type text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_id uuid; v_record jsonb;
BEGIN
 SELECT id, record INTO v_id,v_record FROM public.household_jobs
 WHERE record->>'status'='pending' AND (p_type IS NULL OR record->>'type'=p_type)
 ORDER BY record->>'createdAt' FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 v_record := v_record || jsonb_build_object('status','running','lockedAt',now(),'updatedAt',now(),'attempts',(v_record->>'attempts')::int+1);
 UPDATE public.household_jobs SET record=v_record WHERE id=v_id;
 RETURN v_record;
END $$;

CREATE FUNCTION public.household_finish_job(p_id uuid, p_error text DEFAULT NULL, p_result jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 UPDATE public.household_jobs SET record=record || jsonb_build_object('status',CASE WHEN p_error IS NULL THEN 'done' ELSE 'failed' END,'lockedAt',NULL,'updatedAt',now(),'error',p_error)
 || CASE WHEN p_result IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('payload',(record->'payload') || jsonb_build_object('result',p_result)) END
 WHERE id=p_id AND record->>'status'='running';
 IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_RUNNING'; END IF;
END $$;

CREATE FUNCTION portal.consume_nonce(p_nonce text,p_expires_at timestamptz) RETURNS boolean
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF p_expires_at <= now() THEN RETURN false; END IF;
 INSERT INTO portal.captcha_nonces VALUES(p_nonce,p_expires_at) ON CONFLICT DO NOTHING;
 RETURN FOUND;
END $$;

CREATE FUNCTION portal.update_switches(p_recycler text,p_switches jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_row portal.failure_switches;
BEGIN
 INSERT INTO portal.failure_switches(recycler_id) VALUES(p_recycler) ON CONFLICT DO NOTHING;
 UPDATE portal.failure_switches SET
 fail_next_submit=coalesce((p_switches->>'failNextSubmit')::boolean,fail_next_submit),
 omit_next_reference=coalesce((p_switches->>'omitNextReference')::boolean,omit_next_reference),
 changed_policy_layout=coalesce((p_switches->>'changedPolicyLayout')::boolean,changed_policy_layout),
 hide_fee_info=coalesce((p_switches->>'hideFeeInfo')::boolean,hide_fee_info),
 raise_fee=coalesce((p_switches->>'raiseFee')::boolean,raise_fee),
 hide_review_fee=coalesce((p_switches->>'hideReviewFee')::boolean,hide_review_fee),updated_at=now()
 WHERE recycler_id=p_recycler RETURNING * INTO v_row;
 RETURN jsonb_build_object('failNextSubmit',v_row.fail_next_submit,'omitNextReference',v_row.omit_next_reference,'changedPolicyLayout',v_row.changed_policy_layout,'hideFeeInfo',v_row.hide_fee_info,'raiseFee',v_row.raise_fee,'hideReviewFee',v_row.hide_review_fee);
END $$;
CREATE FUNCTION portal.consume_switch(p_recycler text,p_switch text) RETURNS boolean
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_column text; v_used boolean;
BEGIN
 v_column := CASE p_switch WHEN 'failNextSubmit' THEN 'fail_next_submit' WHEN 'omitNextReference' THEN 'omit_next_reference' WHEN 'changedPolicyLayout' THEN 'changed_policy_layout' WHEN 'hideFeeInfo' THEN 'hide_fee_info' WHEN 'raiseFee' THEN 'raise_fee' WHEN 'hideReviewFee' THEN 'hide_review_fee' ELSE NULL END;
 IF v_column IS NULL THEN RAISE EXCEPTION 'INVALID_SWITCH'; END IF;
 EXECUTE format('UPDATE portal.failure_switches SET %I=false,updated_at=now() WHERE recycler_id=$1 AND %I=true RETURNING true',v_column,v_column) INTO v_used USING p_recycler;
 RETURN coalesce(v_used,false);
END $$;

-- The unique recycler/client index is the authoritative concurrency guarantee.
-- Booking and initial event commit together; duplicate callers see one result.
CREATE FUNCTION portal.create_booking(p_booking jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_row portal.bookings; v_duplicate boolean := false;
BEGIN
 INSERT INTO portal.bookings(recycler_id,booking_reference,client_request_id,full_name,phone,address_line,locality,pincode,preferred_slot,items,charged_fee_inr)
 VALUES(p_booking->>'recycler_id',p_booking->>'booking_reference',p_booking->>'client_request_id',p_booking->>'full_name',p_booking->>'phone',p_booking->>'address_line',p_booking->>'locality',p_booking->>'pincode',p_booking->>'preferred_slot',p_booking->'items',(p_booking->>'charged_fee_inr')::numeric)
 ON CONFLICT(recycler_id,client_request_id) DO NOTHING RETURNING * INTO v_row;
 IF NOT FOUND THEN
  v_duplicate := true;
  SELECT * INTO STRICT v_row FROM portal.bookings WHERE recycler_id=p_booking->>'recycler_id' AND client_request_id=p_booking->>'client_request_id';
 ELSE
  INSERT INTO portal.booking_events(booking_id,event_type,status,detail) VALUES(v_row.id,'BOOKING_CREATED','RECEIVED','Booking request received through public website portal');
 END IF;
 RETURN jsonb_build_object('booking',to_jsonb(v_row)||jsonb_build_object('events',(SELECT coalesce(jsonb_agg(e),'[]'::jsonb) FROM portal.booking_events e WHERE booking_id=v_row.id)),'isDuplicate',v_duplicate);
END $$;

CREATE FUNCTION portal.update_booking(p_recycler text,p_reference text,p_status portal.booking_status,p_detail text,p_options jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
 UPDATE portal.bookings SET status=p_status,updated_at=now(),
 pickup_otp=coalesce(p_options->>'pickupOtp',pickup_otp),
 weight_kg=coalesce((p_options->>'weightKg')::numeric,weight_kg),
 preferred_slot=coalesce(p_options->>'slot',preferred_slot)
 WHERE recycler_id=p_recycler AND lower(booking_reference)=lower(trim(p_reference)) RETURNING id INTO v_id;
 IF v_id IS NOT NULL THEN
 INSERT INTO portal.booking_events(booking_id,event_type,status,detail,is_simulated)
 VALUES(v_id,'STATUS_UPDATED_'||p_status::text,p_status,p_detail,coalesce((p_options->>'isSimulated')::boolean,true));
 END IF;
END $$;

ALTER TABLE public.household_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.captcha_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.household_records,public.household_locks,public.household_jobs,public.household_actions,portal.captcha_nonces FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.household_records,public.household_locks,public.household_jobs,public.household_actions,portal.captcha_nonces TO service_role;
REVOKE ALL ON FUNCTION public.household_lock(uuid,uuid,boolean),public.household_save(jsonb,bigint,uuid),public.household_dequeue(text),public.household_finish_job(uuid,text,jsonb),portal.consume_nonce(text,timestamptz),portal.create_booking(jsonb),portal.update_booking(text,text,portal.booking_status,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.household_lock(uuid,uuid,boolean),public.household_save(jsonb,bigint,uuid),public.household_dequeue(text),public.household_finish_job(uuid,text,jsonb),portal.consume_nonce(text,timestamptz),portal.create_booking(jsonb),portal.update_booking(text,text,portal.booking_status,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION portal.update_switches(text,jsonb),portal.consume_switch(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION portal.update_switches(text,jsonb),portal.consume_switch(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.household_claim_action(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.household_claim_action(jsonb,text) TO service_role;
INSERT INTO storage.buckets(id,name,public) VALUES('recircuit-evidence','recircuit-evidence',false) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='recircuit-evidence' AND public) THEN RAISE EXCEPTION 'Evidence bucket must be private'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
