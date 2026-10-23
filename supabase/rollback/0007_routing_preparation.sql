-- Non-destructive rollback: stop routing workers and disable ROUTING_ENABLED first.
-- Preserve all history and lease evidence for reconciliation; do not drop data.
begin;
revoke execute on function public.routing_lock(text,uuid,boolean),public.routing_history(text,text),public.routing_append(text,text,jsonb,uuid) from service_role;
commit;
-- Reapplying additive migration 0007 restores these permissions after review.
