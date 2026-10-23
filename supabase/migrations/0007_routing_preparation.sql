-- Additive preparation only. Apply to isolated local DBs during verification.
-- Application production routing remains disabled independently of this schema.
begin;
create schema if not exists routing;
revoke all on schema routing from public, anon, authenticated;
create table if not exists routing.locks (
  tenant text primary key check (tenant in ('deccan','paperplus','quickscrap')),
  token uuid,
  acquired_at timestamptz
);
create table if not exists routing.history (
  tenant text not null check (tenant in ('deccan','paperplus','quickscrap')),
  kind text not null check (kind in ('settings','proposals')),
  version integer not null check (version between 1 and 99999999),
  document jsonb not null,
  proposal_id uuid,
  request_key uuid,
  primary key (tenant,kind,version),
  unique (tenant,proposal_id), unique (tenant,request_key),
  check (document->>'tenant'=tenant and (document->>'version')::integer=version),
  check (kind <> 'proposals' or (document#>>'{input,tenant}'=tenant and proposal_id is not null and request_key is not null))
);
alter table routing.locks enable row level security;
alter table routing.history enable row level security;
revoke all on all tables in schema routing from public, anon, authenticated;

create or replace function routing.immutable_history() returns trigger language plpgsql as $$
begin raise exception 'ROUTING_HISTORY_IMMUTABLE'; end $$;
drop trigger if exists immutable_history on routing.history;
create trigger immutable_history before update or delete on routing.history for each row execute function routing.immutable_history();

create or replace function public.routing_lock(p_tenant text,p_token uuid,p_release boolean default false) returns boolean
language plpgsql security definer set search_path = pg_catalog,public as $$
declare held uuid;
begin
  if p_tenant is null or p_tenant not in ('deccan','paperplus','quickscrap') or p_token is null then raise exception 'ROUTING_TENANT_OR_TOKEN_INVALID'; end if;
  insert into routing.locks(tenant) values(p_tenant) on conflict do nothing;
  select token into held from routing.locks where tenant=p_tenant for update;
  if p_release then
    if held is distinct from p_token then return false; end if;
    update routing.locks set token=null where tenant=p_tenant; return true;
  end if;
  if held is not null then return false; end if;
  update routing.locks set token=p_token,acquired_at=clock_timestamp() where tenant=p_tenant; return true;
end $$;

create or replace function public.routing_history(p_tenant text,p_kind text) returns jsonb
language plpgsql security definer set search_path = pg_catalog,public as $$
begin
  if p_tenant is null or p_kind is null or p_tenant not in ('deccan','paperplus','quickscrap') or p_kind not in ('settings','proposals') then raise exception 'ROUTING_SCOPE_INVALID'; end if;
  return coalesce((select jsonb_agg(document order by version) from routing.history where tenant=p_tenant and kind=p_kind),'[]'::jsonb);
end $$;

create or replace function public.routing_append(p_tenant text,p_kind text,p_document jsonb,p_token uuid) returns boolean
language plpgsql security definer set search_path = pg_catalog,public as $$
declare held uuid; next_version integer;
begin
  if p_tenant is null or p_kind is null or p_tenant not in ('deccan','paperplus','quickscrap') or p_kind not in ('settings','proposals') then raise exception 'ROUTING_SCOPE_INVALID'; end if;
  select token into held from routing.locks where tenant=p_tenant for update;
  if p_token is null or held is distinct from p_token then raise exception 'ROUTING_LOCK_REQUIRED'; end if;
  if p_document->>'tenant' is distinct from p_tenant then raise exception 'ROUTING_TENANT_MISMATCH'; end if;
  select coalesce(max(version),0)+1 into next_version from routing.history where tenant=p_tenant and kind=p_kind;
  if (p_document->>'version')::integer is distinct from next_version then raise exception 'ROUTING_VERSION_CONFLICT'; end if;
  if p_kind='proposals' and (p_document#>>'{input,tenant}' is distinct from p_tenant or p_document->>'sourceFingerprint' is null) then raise exception 'ROUTING_PROPOSAL_INVALID'; end if;
  insert into routing.history(tenant,kind,version,document,proposal_id,request_key) values(p_tenant,p_kind,next_version,p_document,case when p_kind='proposals' then (p_document->>'id')::uuid end,case when p_kind='proposals' then (p_document->>'requestKey')::uuid end);
  return true;
end $$;

revoke all on function routing.immutable_history() from public,anon,authenticated;
revoke all on function public.routing_lock(text,uuid,boolean),public.routing_history(text,text),public.routing_append(text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.routing_lock(text,uuid,boolean),public.routing_history(text,text),public.routing_append(text,text,jsonb,uuid) to service_role;
commit;
