import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// 用 PGlite 在記憶體中跑真的 Postgres，模擬 Supabase 的 auth 結構與角色，驗證 migration 的權限規則。
const BOOTSTRAP = `
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;
`

export const USERS = {
  kid: '00000000-0000-4000-8000-00000000000a',
  mom: '00000000-0000-4000-8000-00000000000b',
  mom2: '00000000-0000-4000-8000-00000000000c',
  stranger: '00000000-0000-4000-8000-00000000000d',
}

export async function createDb() {
  const db = new PGlite({ parsers: { 1082: (v) => v } })
  await db.exec(BOOTSTRAP)
  const dir = join(__dirname, '../../supabase/migrations')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'))
  }
  await db.exec(`
    insert into auth.users values ('${USERS.kid}', 'kid@x'), ('${USERS.mom}', 'mom@x'), ('${USERS.mom2}', 'mom2@x'), ('${USERS.stranger}', 's@x');
    insert into public.kt_members values ('${USERS.kid}', 'kid'), ('${USERS.mom}', 'mom'), ('${USERS.mom2}', 'mom');
  `)
  return db
}

// 以某個使用者的身分執行（跟 Supabase 一樣走 authenticated 角色與 RLS）
export async function as<T>(db: PGlite, user: string, sql: string, params: unknown[] = []) {
  await db.exec('begin')
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user])
    await db.exec('set local role authenticated')
    const r = await db.query<T>(sql, params)
    await db.exec('commit')
    return r.rows
  } catch (e) {
    await db.exec('rollback')
    throw e
  }
}
