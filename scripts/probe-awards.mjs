// One-off, read only: how many streaming titles each award row could hold.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const mine = `(select service_id from public.user_services)`;
const q = async (label, where) => {
  const r = (await db.query(`select count(distinct t.id) filter (where exists (select 1 from public.availability v where v.title_id = t.id)) any_service,
    count(distinct t.id) filter (where exists (select 1 from public.availability v where v.title_id = t.id and v.service_id in ${mine})) mine
    from public.awards a join public.titles t on t.id = a.title_id where ${where}`)).rows[0];
  console.log(label.padEnd(44), 'streaming', String(r.any_service).padStart(4), ' on your services', String(r.mine).padStart(4));
};
await q('won anything', 'a.won');
for (const aw of ['Oscars', 'Emmys', 'Golden Globes']) {
  await q(`${aw}: won`, `a.won and a.award = '${aw}'`);
  await q(`${aw}: won best film/series`, `a.won and a.award = '${aw}' and a.rank = 1`);
  await q(`${aw}: won or nominated`, `a.award = '${aw}'`);
}
await q('Oscars: Best Picture won', `a.won and a.award = 'Oscars' and a.category = 'Best Picture'`);
await q('Oscars: Best Picture nominated', `a.award = 'Oscars' and a.category = 'Best Picture'`);
await q('won, film', `a.won and t.kind = 'film'`);
await q('won, series', `a.won and t.kind = 'series'`);
await q('won since 2015', `a.won and a.year >= 2015`);
await q('acting win (lead or supporting)', `a.won and a.rank in (2, 5)`);
await db.end();
