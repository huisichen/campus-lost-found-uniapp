create index if not exists claims_user_idx on public.claims(user_id);
create index if not exists match_notifications_lost_idx on public.match_notifications(lost_id);
create index if not exists match_notifications_found_idx on public.match_notifications(found_id);
create index if not exists posts_point_idx on public.posts(point_id);
