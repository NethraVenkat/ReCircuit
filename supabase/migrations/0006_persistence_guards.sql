-- Preserve historical unknown acknowledgements as NULL. Tighten persisted
-- evidence checks and index owner/action lookups without changing records.
BEGIN;
ALTER TABLE portal.bookings ADD COLUMN data_wipe_acknowledged boolean;
CREATE INDEX household_records_owner_idx ON public.household_records(owner_id,updated_at);
CREATE INDEX household_actions_request_idx ON public.household_actions(request_id);
CREATE OR REPLACE FUNCTION public.household_save(p_record jsonb, p_revision bigint DEFAULT NULL, p_token uuid DEFAULT NULL)
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
 -- Match FileRepository merge semantics for omitted optional plan/approval and
 -- retain metadata that older callers do not understand.
 p_record := coalesce(v_old.record,'{}'::jsonb) || p_record;
 IF p_record#>>'{approval,decision}'='approved' AND p_record#>>'{approval,planHash}' IS DISTINCT FROM p_record#>>'{plan,planHash}' THEN RAISE EXCEPTION 'STALE: approval hash mismatch'; END IF;
 -- Recheck expiry at the database transition, not just in the web process.
 IF (p_record#>>'{request,state}'='APPROVED' AND v_old.record#>>'{request,state}' IS DISTINCT FROM 'APPROVED')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_record#>'{plan,legs}','[]'::jsonb)) l
   WHERE l->>'state'='SUBMITTING' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(v_old.record#>'{plan,legs}','[]'::jsonb)) old WHERE old->>'id'=l->>'id' AND old->>'state'='SUBMITTING')) THEN
  IF p_record#>>'{approval,decision}' IS DISTINCT FROM 'approved' OR p_record#>>'{approval,planHash}' IS DISTINCT FROM p_record#>>'{plan,planHash}' THEN RAISE EXCEPTION 'STALE: approval hash mismatch'; END IF;
  IF p_record#>>'{household,policyMode}' IS DISTINCT FROM 'fixture' THEN
   FOR v_leg IN SELECT * FROM jsonb_array_elements(p_record#>'{plan,legs}') LOOP
    SELECT p INTO v_policy FROM jsonb_array_elements(coalesce(p_record#>'{household,policies}','[]'::jsonb)) p WHERE p->>'recyclerId'=v_leg->>'recyclerId';
    IF v_policy IS NULL OR v_policy->>'status' IS DISTINCT FROM 'SUCCESS' OR coalesce(v_policy->>'provenance','') NOT IN ('live','cached') OR v_policy->>'freshness' IS DISTINCT FROM 'fresh' OR coalesce((v_policy->>'expired')::boolean,true) OR (v_policy->>'expiresAt')::timestamptz IS NULL OR (v_policy->>'expiresAt')::timestamptz <= now() THEN RAISE EXCEPTION 'STALE: policy evidence expired'; END IF;
   END LOOP;
  ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(p_record#>'{plan,legs}') l WHERE l->>'state'='SUBMITTING') THEN RAISE EXCEPTION 'STALE: fixture booking prohibited';
  END IF;
 END IF;
 INSERT INTO public.household_records(id,owner_id,record) VALUES(v_id,p_record#>>'{request,userId}',p_record - 'revision')
 ON CONFLICT(id) DO UPDATE SET record=excluded.record,revision=household_records.revision+1,updated_at=now()
 RETURNING revision INTO v_revision;
 RETURN v_revision;
END $$;

CREATE OR REPLACE FUNCTION public.household_claim_action(p_record jsonb,p_key text) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_doc jsonb; v_leg jsonb; v_policy jsonb;
BEGIN
 SELECT record INTO STRICT v_doc FROM public.household_records WHERE id=(p_record->>'requestId')::uuid FOR UPDATE;
 IF v_doc#>>'{request,state}' IS DISTINCT FROM 'APPROVED' OR v_doc#>>'{approval,decision}' IS DISTINCT FROM 'approved'
 OR v_doc#>>'{approval,planHash}' IS DISTINCT FROM p_record->>'planHash' OR v_doc#>>'{plan,planHash}' IS DISTINCT FROM p_record->>'planHash' THEN RAISE EXCEPTION 'STALE: action approval mismatch'; END IF;
 SELECT l INTO v_leg FROM jsonb_array_elements(v_doc#>'{plan,legs}') l WHERE l->>'id'=p_record->>'legId';
 IF v_leg IS NULL OR v_leg->>'state' IS DISTINCT FROM 'SUBMITTING' OR v_doc#>>'{household,policyMode}'='fixture' THEN RAISE EXCEPTION 'STALE: action state'; END IF;
 SELECT p INTO v_policy FROM jsonb_array_elements(coalesce(v_doc#>'{household,policies}','[]'::jsonb)) p WHERE p->>'recyclerId'=v_leg->>'recyclerId';
 IF v_policy IS NULL OR v_policy->>'status' IS DISTINCT FROM 'SUCCESS' OR coalesce(v_policy->>'provenance','') NOT IN ('live','cached') OR v_policy->>'freshness' IS DISTINCT FROM 'fresh' OR coalesce((v_policy->>'expired')::boolean,true) OR coalesce((v_policy->>'expiresAt')::timestamptz,'-infinity'::timestamptz)<=now() THEN RAISE EXCEPTION 'STALE: action evidence expired'; END IF;
 INSERT INTO public.household_actions(request_id,leg_id,idempotency_key,record) VALUES((p_record->>'requestId')::uuid,p_record->>'legId',p_key,p_record);
END $$;

CREATE OR REPLACE FUNCTION portal.create_booking(p_booking jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_row portal.bookings; v_duplicate boolean := false;
BEGIN
 INSERT INTO portal.bookings(recycler_id,booking_reference,client_request_id,full_name,phone,address_line,locality,pincode,preferred_slot,items,charged_fee_inr,data_wipe_acknowledged)
 VALUES(p_booking->>'recycler_id',p_booking->>'booking_reference',p_booking->>'client_request_id',p_booking->>'full_name',p_booking->>'phone',p_booking->>'address_line',p_booking->>'locality',p_booking->>'pincode',p_booking->>'preferred_slot',p_booking->'items',(p_booking->>'charged_fee_inr')::numeric,(p_booking->>'data_wipe_acknowledged')::boolean)
 ON CONFLICT(recycler_id,client_request_id) DO NOTHING RETURNING * INTO v_row;
 IF NOT FOUND THEN
  v_duplicate := true;
  SELECT * INTO STRICT v_row FROM portal.bookings WHERE recycler_id=p_booking->>'recycler_id' AND client_request_id=p_booking->>'client_request_id';
 ELSE
  INSERT INTO portal.booking_events(booking_id,event_type,status,detail) VALUES(v_row.id,'BOOKING_CREATED','RECEIVED','Booking request received through public website portal');
 END IF;
 RETURN jsonb_build_object('booking',to_jsonb(v_row)||jsonb_build_object('events',(SELECT coalesce(jsonb_agg(e),'[]'::jsonb) FROM portal.booking_events e WHERE booking_id=v_row.id)),'isDuplicate',v_duplicate);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
