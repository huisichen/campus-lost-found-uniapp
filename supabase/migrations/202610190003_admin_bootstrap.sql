-- The first admin is configured only in the database, not in the public repo.
-- No account is privileged until its email address has been confirmed.
create table public.admin_allowlist (email text primary key);
alter table public.admin_allowlist enable row level security;
revoke all on public.admin_allowlist from anon, authenticated;

create or replace function public.apply_admin_role()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  if new.email_confirmed_at is not null and exists (
    select 1 from public.admin_allowlist where lower(email) = lower(new.email)
  ) then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb;
  elsif old.raw_app_meta_data ->> 'role' = 'admin' then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) - 'role';
  end if;
  return new;
end $$;
create trigger apply_admin_role_before_update before update on auth.users
for each row execute function public.apply_admin_role();
