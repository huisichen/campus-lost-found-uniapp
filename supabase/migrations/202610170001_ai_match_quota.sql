-- Authenticated callers may use the AI endpoint at most ten times per UTC day.
create table if not exists public.ai_match_quota (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  calls integer not null check (calls >= 0),
  primary key (user_id, day)
);

alter table public.ai_match_quota enable row level security;
revoke all on public.ai_match_quota from anon, authenticated;

create or replace function public.consume_ai_match_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted boolean := false;
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  insert into public.ai_match_quota (user_id, day, calls)
  values ((select auth.uid()), (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, day) do update
    set calls = public.ai_match_quota.calls + 1
    where public.ai_match_quota.calls < 10
  returning true into accepted;
  return coalesce(accepted, false);
end;
$$;

revoke all on function public.consume_ai_match_quota() from public, anon;
grant execute on function public.consume_ai_match_quota() to authenticated;
