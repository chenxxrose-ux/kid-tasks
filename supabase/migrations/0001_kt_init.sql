-- 今日事：樂樂的每日任務、留言、存錢筒
-- 跟「叫蛋記帳」共用同一個 Supabase 專案，所以每張表都用 kt_ 開頭，權限也完全分開。
-- 兩種身分：kid（樂樂）、mom（媽媽們，兩個人共用一個身分）

create table public.kt_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('kid', 'mom')),
  created_at timestamptz not null default now()
);

-- 目前登入者的身分；不是成員就是 null
create function public.kt_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.kt_members where user_id = auth.uid()
$$;

-- 台灣的今天
create function public.kt_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Taipei')::date
$$;

-- 每天固定的任務（媽媽們在「安排」改）
create table public.kt_tasks (
  id text primary key check (length(id) between 1 and 64),
  title text not null check (length(btrim(title)) between 1 and 40),
  slot text not null check (slot in ('morning', 'home', 'extra', 'study', 'meal', 'bath', 'night')),
  days smallint[] not null check (cardinality(days) between 1 and 7 and days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  active boolean not null default true,
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

-- 媽媽們交代的（某一天才要做的事）
create table public.kt_asks (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  title text not null check (length(btrim(title)) between 1 and 40),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index kt_asks_day on public.kt_asks (day);

-- 打勾：樂樂勾的時間記在 checked_at；當天可以取消，隔天就鎖住
create table public.kt_checks (
  day date not null,
  task_id text not null check (length(task_id) between 1 and 64),
  checked_at timestamptz not null,
  checked_by uuid not null default auth.uid() references auth.users (id),
  primary key (day, task_id)
);

-- 留言（雙向）
create table public.kt_messages (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references auth.users (id),
  role text not null check (role in ('kid', 'mom')),
  body text not null check (length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index kt_messages_created on public.kt_messages (created_at);

-- 每個身分看到哪裡（媽媽們共用一個）
create table public.kt_reads (
  role text primary key check (role in ('kid', 'mom')),
  read_at timestamptz not null
);

-- 存錢筒：存入（媽媽們記）、領錢（樂樂申請、媽媽們同意）。金額是整數元。
create table public.kt_bank (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('in', 'out')),
  amount bigint not null check (amount > 0 and amount <= 10000000),
  memo text not null check (length(btrim(memo)) between 1 and 60),
  status text not null check (status in ('pending', 'ok', 'denied', 'cancelled')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id),
  decided_at timestamptz
);
create index kt_bank_created on public.kt_bank (created_at);

-- 考試（段考日期來自學校行事曆，科目由媽媽們填）
create table public.kt_exams (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  title text not null check (length(btrim(title)) between 1 and 30),
  subjects text not null default '' check (length(subjects) <= 80),
  created_at timestamptz not null default now()
);
create index kt_exams_day on public.kt_exams (day);

-- 樂樂打開網頁的時間
create table public.kt_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id),
  at timestamptz not null default now()
);
create index kt_visits_at on public.kt_visits (at);

-- 留言的身分由資料庫決定，不信任前端
create function public.kt_set_message_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.role := public.kt_role();
  new.author := auth.uid();
  new.created_at := now();
  return new;
end $$;
create trigger kt_messages_role before insert on public.kt_messages
for each row execute function public.kt_set_message_role();

-- 存錢筒：新增時依身分強制種類與狀態
create function public.kt_bank_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r text := public.kt_role();
begin
  new.created_by := auth.uid();
  new.created_at := now();
  new.decided_by := null;
  new.decided_at := null;
  if r = 'mom' and new.kind = 'in' then
    new.status := 'ok';
  elsif r = 'kid' and new.kind = 'out' then
    new.status := 'pending';
  else
    raise exception '只有媽媽們能存入，只有樂樂能申請領錢' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger kt_bank_insert before insert on public.kt_bank
for each row execute function public.kt_bank_guard();

create function public.kt_balance() returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when kind = 'in' then amount else -amount end), 0)::bigint
  from public.kt_bank where status = 'ok'
$$;

-- 媽媽們同意或不同意領錢；同意時不能超過餘額
create function public.kt_decide(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.kt_bank;
begin
  if public.kt_role() is distinct from 'mom' then
    raise exception '只有媽媽們能確認' using errcode = '42501';
  end if;
  lock table public.kt_bank in share row exclusive mode;
  select * into b from public.kt_bank where id = p_id;
  if not found then raise exception '找不到這筆申請' using errcode = 'P0002'; end if;
  if b.status <> 'pending' then raise exception '這筆已經處理過了' using errcode = 'P0001'; end if;
  if p_approve and b.amount > public.kt_balance() then
    raise exception '超過存錢筒的金額' using errcode = 'P0001';
  end if;
  update public.kt_bank
     set status = case when p_approve then 'ok' else 'denied' end,
         decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $$;

-- 按「知道了」或回覆：記下這個身分看到哪裡（只會往後，不會倒退）
create function public.kt_mark_read(p_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := public.kt_role();
begin
  if r is null then raise exception '不是成員' using errcode = '42501'; end if;
  insert into public.kt_reads (role, read_at) values (r, least(p_at, now()))
  on conflict (role) do update set read_at = greatest(public.kt_reads.read_at, excluded.read_at);
end $$;

-- 樂樂取消自己還沒被確認的申請
create function public.kt_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.kt_role() is distinct from 'kid' then
    raise exception '只有樂樂能取消申請' using errcode = '42501';
  end if;
  update public.kt_bank set status = 'cancelled', decided_by = auth.uid(), decided_at = now()
   where id = p_id and status = 'pending' and created_by = auth.uid();
  if not found then raise exception '這筆已經處理過了' using errcode = 'P0001'; end if;
end $$;

-- ───── 權限 ─────
alter table public.kt_members enable row level security;
alter table public.kt_tasks enable row level security;
alter table public.kt_asks enable row level security;
alter table public.kt_checks enable row level security;
alter table public.kt_messages enable row level security;
alter table public.kt_reads enable row level security;
alter table public.kt_bank enable row level security;
alter table public.kt_exams enable row level security;
alter table public.kt_visits enable row level security;

revoke all on public.kt_members, public.kt_tasks, public.kt_asks, public.kt_checks, public.kt_messages,
  public.kt_reads, public.kt_bank, public.kt_exams, public.kt_visits from anon, authenticated;

grant select on public.kt_members, public.kt_tasks, public.kt_asks, public.kt_checks, public.kt_messages,
  public.kt_reads, public.kt_bank, public.kt_exams, public.kt_visits to authenticated;
grant insert (id, title, slot, days, active, sort) on public.kt_tasks to authenticated;
grant update (title, slot, days, active, sort, updated_at) on public.kt_tasks to authenticated;
grant insert (id, day, title) on public.kt_asks to authenticated;
grant update (removed_at) on public.kt_asks to authenticated;
grant insert (day, task_id, checked_at), delete on public.kt_checks to authenticated;
grant insert (id, body) on public.kt_messages to authenticated;
grant insert (id, kind, amount, memo) on public.kt_bank to authenticated;
grant insert (id, day, title, subjects), update (day, title, subjects), delete on public.kt_exams to authenticated;
grant insert (id, at) on public.kt_visits to authenticated;

create policy kt_read on public.kt_members for select to authenticated using (public.kt_role() is not null);
create policy kt_read on public.kt_tasks for select to authenticated using (public.kt_role() is not null);
create policy kt_read on public.kt_asks for select to authenticated using (public.kt_role() is not null);
create policy kt_read on public.kt_checks for select to authenticated using (public.kt_role() is not null);
create policy kt_read on public.kt_messages for select to authenticated using (public.kt_role() is not null);
create policy kt_read on public.kt_reads for select to authenticated using (public.kt_role() is not null);
create policy kt_read on public.kt_bank for select to authenticated using (public.kt_role() is not null);
create policy kt_read on public.kt_exams for select to authenticated using (public.kt_role() is not null);
create policy kt_read on public.kt_visits for select to authenticated using (public.kt_role() is not null);

-- 只有媽媽們能改任務、交代事情、改考試
create policy kt_mom_insert on public.kt_tasks for insert to authenticated with check (public.kt_role() = 'mom');
create policy kt_mom_update on public.kt_tasks for update to authenticated using (public.kt_role() = 'mom') with check (public.kt_role() = 'mom');
create policy kt_mom_insert on public.kt_asks for insert to authenticated with check (public.kt_role() = 'mom' and created_by = auth.uid());
create policy kt_mom_update on public.kt_asks for update to authenticated using (public.kt_role() = 'mom') with check (public.kt_role() = 'mom');
create policy kt_mom_insert on public.kt_exams for insert to authenticated with check (public.kt_role() = 'mom');
create policy kt_mom_update on public.kt_exams for update to authenticated using (public.kt_role() = 'mom') with check (public.kt_role() = 'mom');
create policy kt_mom_delete on public.kt_exams for delete to authenticated using (public.kt_role() = 'mom');

-- 只有樂樂能打勾。離線時勾的會晚一點送到，所以接受昨天和今天；
-- 打勾時間必須落在那一天，且不能是未來。取消只限今天。
create policy kt_kid_insert on public.kt_checks for insert to authenticated with check (
  public.kt_role() = 'kid'
  and checked_by = auth.uid()
  and day between public.kt_today() - 1 and public.kt_today()
  and (checked_at at time zone 'Asia/Taipei')::date = day
  and checked_at <= now() + interval '5 minutes'
);
create policy kt_kid_delete on public.kt_checks for delete to authenticated using (
  public.kt_role() = 'kid' and day = public.kt_today()
);

create policy kt_member_insert on public.kt_messages for insert to authenticated with check (public.kt_role() is not null);


create policy kt_member_insert on public.kt_bank for insert to authenticated with check (public.kt_role() is not null);

create policy kt_kid_insert on public.kt_visits for insert to authenticated with check (
  public.kt_role() = 'kid' and user_id = auth.uid() and at <= now() + interval '5 minutes'
);

revoke all on function public.kt_role(), public.kt_today(), public.kt_balance(), public.kt_decide(uuid, boolean),
  public.kt_cancel(uuid), public.kt_mark_read(timestamptz), public.kt_set_message_role(), public.kt_bank_guard() from public, anon, authenticated;
-- kt_balance 只給資料庫內部用（同意領錢時檢查），不開放直接呼叫
grant execute on function public.kt_role(), public.kt_today(), public.kt_decide(uuid, boolean),
  public.kt_cancel(uuid), public.kt_mark_read(timestamptz) to authenticated;

-- 即時同步：三支手機看到同一份資料
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.kt_tasks, public.kt_asks, public.kt_checks,
      public.kt_messages, public.kt_reads, public.kt_bank, public.kt_exams, public.kt_visits;
  end if;
end $$;
