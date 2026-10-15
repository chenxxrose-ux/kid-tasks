-- 點數：超出本分的努力換獎勵（陪伴、自己做決定、小東西）。點數不能換錢，跟存錢筒分開。
-- 每天今日事的任務是本分，不給點。拿點數的方法：
--   1. 一週（週一到週日）裡有 5 天全做完 +10（樂樂的手機算好後記一筆，每週只能一筆）
--   2. 加分清單裡的事（樂樂申請、媽媽們確認 +5），每項一週一次；自己寫的一週 2 次，媽媽們決定給幾點
--   3. 媽媽們的驚喜加分（一定要寫原因）
-- 點數不會被扣；只有換獎勵時扣。換獎勵要媽媽們同意，答應的獎勵做到了再按「做到了」。

-- 加分清單（媽媽們維護）
create table public.kt_pt_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 30),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

-- 獎勵（媽媽們可以改點數）
create table public.kt_pt_rewards (
  id text primary key check (length(id) between 1 and 64),
  title text not null check (length(btrim(title)) between 1 and 30),
  sub text not null default '' check (length(sub) <= 30),
  pts integer not null check (pts between 1 and 1000),
  active boolean not null default true,
  sort integer not null default 0
);

-- 樂樂的申請：加分（help）或換獎勵（redeem）
create table public.kt_pt_reqs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('help', 'redeem')),
  item_id uuid references public.kt_pt_items (id),
  reward_id text references public.kt_pt_rewards (id),
  title text not null check (length(btrim(title)) between 1 and 40),
  own boolean not null default false,
  pts integer not null default 0,
  -- pending 等媽媽們；ok 確認／同意；no 還不算／再等等；duty 是本分；cancelled 樂樂取消
  status text not null default 'pending' check (status in ('pending', 'ok', 'no', 'duty', 'cancelled')),
  gave integer,
  when_text text check (length(when_text) <= 30),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  delivered_at timestamptz,
  check ((kind = 'help') = (reward_id is null))
);

-- 點數紀錄：只增不改。help／redeem 由確認的函式寫入（id 跟申請同一個）
create table public.kt_pt_ledger (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('help', 'bonus', 'streak', 'redeem')),
  pts integer not null check (pts between -1000 and 1000 and pts <> 0),
  why text not null check (length(btrim(why)) between 1 and 60),
  week date,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check ((kind = 'streak') = (week is not null))
);
create unique index kt_pt_ledger_week on public.kt_pt_ledger (week) where kind = 'streak';

-- 樂樂的目標，以及她上次看到媽媽們回覆的時間（只有一列）
create table public.kt_pt_state (
  id smallint primary key default 1 check (id = 1),
  goal text references public.kt_pt_rewards (id),
  seen_at timestamptz not null default now()
);
insert into public.kt_pt_state (id) values (1);

insert into public.kt_pt_items (title, sort) values
  ('整理冰箱', 10),
  ('擦窗戶、紗窗', 20),
  ('整理鞋櫃或公用櫃子', 30),
  ('學會一道新菜', 40),
  ('讀完一本圖書館借的書，跟媽媽們分享', 50);

insert into public.kt_pt_rewards (id, title, sub, pts, sort) values
  ('meal', '決定週末某一餐吃什麼', '', 20, 10),
  ('bedtime', '睡前媽媽陪 20 分鐘', '聊天、桌遊，你選', 20, 20),
  ('small-thing', '選一樣小東西', '媽媽們買，上限 $100', 50, 30),
  ('dinner', '週末晚餐去你選的店', '', 50, 40),
  ('outing', '收工後去你選的地方', '夜市、吃宵夜', 100, 50),
  ('big-thing', '選一樣想要的東西', '媽媽們買，上限 $300', 100, 60),
  ('wish', '一個小願望', '媽媽們評估', 100, 70);

-- 這一週的週一（台灣時間）
create function public.kt_week(p_at timestamptz) returns date
language sql immutable set search_path = '' as $$
  select date_trunc('week', (p_at at time zone 'Asia/Taipei'))::date
$$;

create function public.kt_pt_balance() returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(pts), 0)::bigint from public.kt_pt_ledger
$$;

-- 申請送進來：換獎勵的點數照獎勵表；加分有每週次數上限
create function public.kt_pt_req_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if new.kind = 'redeem' then
    select pts, title into new.pts, new.title from public.kt_pt_rewards where id = new.reward_id and active;
    if not found then raise exception '找不到這個獎勵' using errcode = 'P0001'; end if;
    new.item_id := null;
    new.own := false;
  else
    new.pts := 0;
    if new.own then
      new.item_id := null;
      select count(*) into n from public.kt_pt_reqs
       where kind = 'help' and own and status not in ('cancelled') and public.kt_week(created_at) = public.kt_week(now());
      if n >= 2 then raise exception '自己寫的這週已經用完 2 次了' using errcode = 'P0001'; end if;
    else
      select title into new.title from public.kt_pt_items where id = new.item_id and active;
      if not found then raise exception '加分清單裡沒有這一項' using errcode = 'P0001'; end if;
      select count(*) into n from public.kt_pt_reqs
       where item_id = new.item_id and status not in ('cancelled', 'no') and public.kt_week(created_at) = public.kt_week(now());
      if n >= 1 then raise exception '這一項這週做過了，下週一再來' using errcode = 'P0001'; end if;
    end if;
  end if;
  new.status := 'pending';
  new.gave := null;
  new.when_text := null;
  new.decided_by := null;
  new.decided_at := null;
  new.delivered_at := null;
  new.created_at := now();
  return new;
end $$;
create trigger kt_pt_req_guard before insert on public.kt_pt_reqs for each row execute function public.kt_pt_req_guard();

-- 媽媽們回覆申請。
--   加分：p_give 給幾點（清單裡的固定 5）；p_give 為 null 是「還不算」；p_duty 是「謝謝你，這是本分喔」
--   換獎勵：p_give 不為 null 就是同意（扣點、約時間）；null 是「再等等」
create function public.kt_pt_decide(p_id uuid, p_give integer, p_duty boolean, p_when text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.kt_pt_reqs;
begin
  if public.kt_role() is distinct from 'mom' then
    raise exception '只有媽媽們能確認' using errcode = '42501';
  end if;
  lock table public.kt_pt_ledger in share row exclusive mode;
  select * into r from public.kt_pt_reqs where id = p_id for update;
  if not found then raise exception '找不到這個申請' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception '這件已經處理過了' using errcode = 'P0001'; end if;

  if r.kind = 'help' then
    if p_duty then
      update public.kt_pt_reqs set status = 'duty', decided_by = auth.uid(), decided_at = now() where id = p_id;
    elsif p_give is null then
      update public.kt_pt_reqs set status = 'no', decided_by = auth.uid(), decided_at = now() where id = p_id;
    else
      if (not r.own and p_give <> 5) or (r.own and p_give not in (5, 10)) then
        raise exception '點數不對' using errcode = 'P0001';
      end if;
      update public.kt_pt_reqs set status = 'ok', gave = p_give, decided_by = auth.uid(), decided_at = now() where id = p_id;
      insert into public.kt_pt_ledger (id, kind, pts, why) values (r.id, 'help', p_give, r.title);
    end if;
  else
    if p_give is null then
      update public.kt_pt_reqs set status = 'no', decided_by = auth.uid(), decided_at = now() where id = p_id;
    else
      if r.pts > public.kt_pt_balance() then
        raise exception '樂樂的點數不夠了' using errcode = 'P0001';
      end if;
      update public.kt_pt_reqs
         set status = 'ok', when_text = nullif(btrim(coalesce(p_when, '')), ''), decided_by = auth.uid(), decided_at = now()
       where id = p_id;
      insert into public.kt_pt_ledger (id, kind, pts, why) values (r.id, 'redeem', -r.pts, '換：' || r.title);
      update public.kt_pt_state set goal = null where id = 1 and goal = r.reward_id;
    end if;
  end if;
end $$;

-- 樂樂取消還沒回覆的申請
create function public.kt_pt_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.kt_role() is distinct from 'kid' then
    raise exception '只有樂樂能取消' using errcode = '42501';
  end if;
  update public.kt_pt_reqs set status = 'cancelled', decided_at = now()
   where id = p_id and status = 'pending' and created_by = auth.uid();
  if not found then raise exception '這件已經處理過了' using errcode = 'P0001'; end if;
end $$;

-- 媽媽們兌現了答應的獎勵
create function public.kt_pt_deliver(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.kt_role() is distinct from 'mom' then
    raise exception '只有媽媽們能按' using errcode = '42501';
  end if;
  update public.kt_pt_reqs set delivered_at = now()
   where id = p_id and kind = 'redeem' and status = 'ok' and delivered_at is null;
end $$;

-- 樂樂選目標、看過回覆
create function public.kt_pt_goal(p_goal text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.kt_role() is distinct from 'kid' then
    raise exception '只有樂樂能選目標' using errcode = '42501';
  end if;
  update public.kt_pt_state set goal = p_goal where id = 1;
end $$;

create function public.kt_pt_seen(p_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.kt_role() is distinct from 'kid' then
    raise exception '只有樂樂能按' using errcode = '42501';
  end if;
  update public.kt_pt_state set seen_at = greatest(seen_at, least(p_at, now())) where id = 1;
end $$;

-- ───── 權限 ─────
alter table public.kt_pt_items enable row level security;
alter table public.kt_pt_rewards enable row level security;
alter table public.kt_pt_reqs enable row level security;
alter table public.kt_pt_ledger enable row level security;
alter table public.kt_pt_state enable row level security;

revoke all on public.kt_pt_items, public.kt_pt_rewards, public.kt_pt_reqs, public.kt_pt_ledger, public.kt_pt_state from anon, authenticated;
grant select on public.kt_pt_items, public.kt_pt_rewards, public.kt_pt_reqs, public.kt_pt_ledger, public.kt_pt_state to authenticated;
grant insert (id, title, sort), update (title, active, sort) on public.kt_pt_items to authenticated;
grant update (pts) on public.kt_pt_rewards to authenticated;
grant insert (id, kind, item_id, reward_id, title, own) on public.kt_pt_reqs to authenticated;
grant insert (id, kind, pts, why, week) on public.kt_pt_ledger to authenticated;

create policy kt_read on public.kt_pt_items for select to authenticated using (public.kt_role() is not null);
create policy kt_read on public.kt_pt_rewards for select to authenticated using (public.kt_role() is not null);
create policy kt_read on public.kt_pt_reqs for select to authenticated using (public.kt_role() is not null);
create policy kt_read on public.kt_pt_ledger for select to authenticated using (public.kt_role() is not null);
create policy kt_read on public.kt_pt_state for select to authenticated using (public.kt_role() is not null);

create policy kt_mom_insert on public.kt_pt_items for insert to authenticated with check (public.kt_role() = 'mom');
create policy kt_mom_update on public.kt_pt_items for update to authenticated using (public.kt_role() = 'mom') with check (public.kt_role() = 'mom');
create policy kt_mom_update on public.kt_pt_rewards for update to authenticated using (public.kt_role() = 'mom') with check (public.kt_role() = 'mom');
create policy kt_kid_insert on public.kt_pt_reqs for insert to authenticated with check (public.kt_role() = 'kid' and created_by = auth.uid());
-- 媽媽們的驚喜加分（1 到 50 點，一定要寫原因）
create policy kt_mom_bonus on public.kt_pt_ledger for insert to authenticated with check (
  public.kt_role() = 'mom' and kind = 'bonus' and pts between 1 and 50 and week is null and created_by = auth.uid()
);
-- 樂樂的手機算到一週 5 天全做完，記一筆 +10（這週或上週，每週只能一筆）
create policy kt_kid_streak on public.kt_pt_ledger for insert to authenticated with check (
  public.kt_role() = 'kid' and kind = 'streak' and pts = 10 and created_by = auth.uid()
  and week in (public.kt_week(now()), public.kt_week(now()) - 7)
);

revoke all on function public.kt_week(timestamptz), public.kt_pt_balance(), public.kt_pt_req_guard(),
  public.kt_pt_decide(uuid, integer, boolean, text), public.kt_pt_cancel(uuid), public.kt_pt_deliver(uuid),
  public.kt_pt_goal(text), public.kt_pt_seen(timestamptz) from public, anon, authenticated;
grant execute on function public.kt_week(timestamptz), public.kt_pt_decide(uuid, integer, boolean, text), public.kt_pt_cancel(uuid),
  public.kt_pt_deliver(uuid), public.kt_pt_goal(text), public.kt_pt_seen(timestamptz) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.kt_pt_items, public.kt_pt_rewards, public.kt_pt_reqs,
      public.kt_pt_ledger, public.kt_pt_state;
  end if;
end $$;
