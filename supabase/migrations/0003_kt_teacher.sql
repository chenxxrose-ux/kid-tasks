-- 老師說：老師交代的事（帶東西、交作業、簽名），放在第一頁。
-- 跟媽媽們交代的放同一張表，用 source 分開。老師的事不限哪一天：
-- 從寫上去那天起一直留著，直到樂樂打勾或媽媽們拿掉；可以填期限。
-- 老師通常直接跟樂樂說，所以樂樂也能寫「老師說」的事；拿掉還是只有媽媽們能。
alter table public.kt_asks
  add column source text not null default 'mom' check (source in ('mom', 'teacher')),
  add column due date;

grant insert (source, due) on public.kt_asks to authenticated;

drop policy kt_mom_insert on public.kt_asks;
create policy kt_member_insert on public.kt_asks for insert to authenticated with check (
  created_by = auth.uid()
  and (public.kt_role() = 'mom' or (public.kt_role() = 'kid' and source = 'teacher'))
);
