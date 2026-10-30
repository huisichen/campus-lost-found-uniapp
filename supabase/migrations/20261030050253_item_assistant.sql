-- Applied as migration 20261030050253. Preset passwords are never cloud admin credentials.
create table public.assistant_devices (
 id uuid primary key default gen_random_uuid(), token_hash text not null unique,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '90 days'
);
create table public.assistant_limits (
 scope text not null, day date not null default current_date, used integer not null default 0,
 primary key(scope,day)
);
create table public.assistant_index (
 device_id uuid not null references public.assistant_devices(id) on delete cascade,
 post_id text not null, public_item jsonb not null, features jsonb not null,
 feature_vector double precision[] not null check(array_length(feature_vector,1)=128),
 content_hash text not null, private_checks jsonb not null default '[]', details_hash text,
 updated_at timestamptz not null default now(), primary key(device_id,post_id)
);
create table public.assistant_sessions (
 id uuid primary key default gen_random_uuid(), device_id uuid not null,
 post_id text not null, claimant_id text not null, checks jsonb not null,
 answers jsonb not null default '[]', result jsonb, consumed boolean not null default false,
 revision integer not null default 0, expires_at timestamptz not null default now()+interval '30 minutes',
 created_at timestamptz not null default now(),
 foreign key(device_id,post_id) references public.assistant_index(device_id,post_id) on delete cascade
);
create index assistant_sessions_lookup on public.assistant_sessions(device_id,post_id,claimant_id,created_at);
alter table public.assistant_devices enable row level security;
alter table public.assistant_limits enable row level security;
alter table public.assistant_index enable row level security;
alter table public.assistant_sessions enable row level security;
revoke all on public.assistant_devices,public.assistant_limits,public.assistant_index,public.assistant_sessions from anon,authenticated;
grant all on public.assistant_devices,public.assistant_limits,public.assistant_index,public.assistant_sessions to service_role;
create function public.assistant_take_quota(p_scope text,p_limit integer) returns boolean
language plpgsql security invoker set search_path=public as $$
declare n integer;
begin
 insert into public.assistant_limits(scope,day,used) values(p_scope,current_date,1)
 on conflict(scope,day) do update set used=assistant_limits.used+1
 where assistant_limits.used<p_limit returning used into n;
 return n is not null;
end;
$$;
revoke all on function public.assistant_take_quota(text,integer) from public,anon,authenticated;
grant execute on function public.assistant_take_quota(text,integer) to service_role;
