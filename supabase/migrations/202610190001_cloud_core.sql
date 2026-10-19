-- Real accounts and shared records. All client-facing tables have RLS.
create or replace function public.is_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) $$;
grant execute on function public.is_admin() to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '同学',
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create or replace function public.create_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  insert into public.profiles(id, display_name, email)
  values (new.id, coalesce(nullif(split_part(new.email, '@', 1), ''), '同学'), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.create_profile();

create table public.return_points (
  id text primary key,
  name text not null,
  address text not null,
  hours text not null,
  department text not null,
  verified boolean not null default false
);
alter table public.return_points enable row level security;
create policy points_read on public.return_points for select to authenticated using (true);
create policy points_admin_insert on public.return_points for insert to authenticated with check (public.is_admin());
create policy points_admin_update on public.return_points for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy points_admin_delete on public.return_points for delete to authenticated using (public.is_admin());

create table public.posts (
  id text primary key,
  owner_id uuid not null references auth.users(id),
  owner_name text not null,
  kind text not null check (kind in ('lost', 'found')),
  title text not null check (char_length(title) between 1 and 80),
  category text not null,
  location text not null,
  description text not null default '',
  image text not null default '' check (char_length(image) <= 4200000),
  holder_name text not null default '',
  document_no text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','returned','rejected','closed')),
  point_id text references public.return_points(id) on delete restrict,
  created_at timestamptz not null default now(),
  returned_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint document_privacy check (
    category <> '证件卡类' or
    (image = '' and (holder_name = '' or holder_name ~ '^.\*\*$') and
     (document_no = '' or document_no = '*' or document_no ~ '^.\*{2,}.$'))
  )
);
create index posts_feed_idx on public.posts(status, created_at desc);
create index posts_owner_idx on public.posts(owner_id, created_at desc);
alter table public.posts enable row level security;
create policy posts_read on public.posts for select to authenticated
  using (status in ('approved','returned') or owner_id = auth.uid() or public.is_admin());
create policy posts_user_insert on public.posts for insert to authenticated
  with check (owner_id = auth.uid() and status = 'pending' and returned_at is null);
create policy posts_update on public.posts for update to authenticated
  using (public.is_admin() or owner_id = auth.uid())
  with check (public.is_admin() or owner_id = auth.uid());
create or replace function public.guard_post_update()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin
  if not public.is_admin() then
    if auth.uid() <> old.owner_id or new.status <> 'closed' or
       old.status not in ('pending','approved') or
       (to_jsonb(new) - 'status' - 'updated_at') <> (to_jsonb(old) - 'status' - 'updated_at') then
      raise exception 'Only withdrawal is permitted';
    end if;
  end if;
  new.updated_at := now();
  if new.status = 'returned' and old.status <> 'returned' then new.returned_at := now(); end if;
  return new;
end $$;
create trigger guard_post before update on public.posts
for each row execute function public.guard_post_update();

create table public.claims (
  id text primary key,
  post_id text not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  user_name text not null,
  note text not null check (char_length(note) between 1 and 140),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);
alter table public.claims enable row level security;
create policy claims_read on public.claims for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or exists
    (select 1 from public.posts p where p.id = post_id and p.owner_id = auth.uid()));
create policy claims_insert on public.claims for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and exists
    (select 1 from public.posts p where p.id = post_id and p.kind = 'found'
     and p.status = 'approved' and p.owner_id <> auth.uid()));
create policy claims_admin_update on public.claims for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table public.match_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lost_id text not null references public.posts(id) on delete cascade,
  found_id text not null references public.posts(id) on delete cascade,
  score integer not null check (score between 70 and 100),
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique(user_id, lost_id, found_id)
);
alter table public.match_notifications enable row level security;
create policy notifications_read on public.match_notifications for select to authenticated
  using (user_id = auth.uid());

create table public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) <= 2048 and endpoint ~ '^https://'),
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);
create index push_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
create policy push_own_read on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_own_insert on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_own_update on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_own_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

grant select on public.profiles, public.return_points, public.posts, public.claims, public.match_notifications, public.push_subscriptions to authenticated;
grant insert, update, delete on public.return_points, public.posts, public.claims, public.push_subscriptions to authenticated;
grant usage on schema public to authenticated;
