-- 我需要：樂樂請媽媽們幫忙準備的東西（材料、文具、要繳的錢…）。
-- 樂樂寫、可以拿掉自己寫的；媽媽們按「準備好了」（done_at），也能取消。
create table public.kt_needs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 40),
  due date,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  removed_at timestamptz
);

alter table public.kt_needs enable row level security;
revoke all on public.kt_needs from anon, authenticated;
grant select on public.kt_needs to authenticated;
grant insert (id, title, due) on public.kt_needs to authenticated;
grant update (done_at, removed_at) on public.kt_needs to authenticated;

create policy kt_read on public.kt_needs for select to authenticated using (public.kt_role() is not null);
create policy kt_kid_insert on public.kt_needs for insert to authenticated with check (
  public.kt_role() = 'kid' and created_by = auth.uid()
);
create policy kt_member_update on public.kt_needs for update to authenticated
  using (public.kt_role() = 'mom' or (public.kt_role() = 'kid' and created_by = auth.uid()))
  with check (public.kt_role() = 'mom' or (public.kt_role() = 'kid' and created_by = auth.uid()));

-- 樂樂只能拿掉，不能自己標「準備好了」
create function public.kt_needs_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if public.kt_role() = 'kid' and new.done_at is distinct from old.done_at then
    raise exception '只有媽媽們能標準備好了' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger kt_needs_guard before update on public.kt_needs for each row execute function public.kt_needs_guard();
revoke all on function public.kt_needs_guard() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.kt_needs;
  end if;
end $$;
