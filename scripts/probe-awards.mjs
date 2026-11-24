// One-off, read only: how many streaming titles each award row could hold.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const q = async (label, sql) => console.log(label.padEnd(46), JSON.stringify((await db.query(sql)).rows));
const streams = `exists (select 1 from public.availability v where v.title_id = t.id)`;
await q('awards rows / titles', `select count(*) n, count(distinct title_id) titles, min(year), max(year) from public.awards`);
await q('won, streaming, by award and kind', `select a.award, t.kind, count(distinct t.id) n from public.awards a join public.titles t on t.id = a.title_id where a.won and ${streams} group by 1,2 order by 1,2`);
await q('won, streaming, rank 1 (best film/series)', `select a.award, t.kind, count(distinct t.id) n from public.awards a join public.titles t on t.id = a.title_id where a.won and a.rank = 1 and ${streams} group by 1,2 order by 1,2`);
await q('nominated (any), streaming, by award', `select a.award, count(distinct t.id) n from public.awards a join public.titles t on t.id = a.title_id where ${streams} group by 1 order by 1`);
await q('won anything, streaming, by kind', `select t.kind, count(distinct t.id) n from public.awards a join public.titles t on t.id = a.title_id where a.won and ${streams} group by 1`);
await q('won, streaming, last 5 years', `select count(distinct t.id) n from public.awards a join public.titles t on t.id = a.title_id where a.won and a.year >= 2021 and ${streams}`);
await q('member services', `select user_id, array_agg(service_id) s from public.user_services group by 1`);
await q('won, on member services, by award', `select a.award, count(distinct t.id) n from public.awards a join public.titles t on t.id = a.title_id where a.won and exists (select 1 from public.availability v where v.title_id = t.id and v.service_id in (select service_id from public.user_services)) group by 1`);
await q('categories (top)', `select award, short_category, rank, count(*) n from public.awards where won group by 1,2,3 order by n desc limit 15`);
await db.end();
