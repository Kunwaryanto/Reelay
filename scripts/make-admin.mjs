// Used by the Make admin workflow. Reads EMAIL, POOLER_URL and SUPABASE_DB_PASSWORD.
import pg from 'pg';
import { appendFileSync } from 'node:fs';

const email = (process.env.EMAIL || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Not an email address');

const url = new URL(process.env.POOLER_URL);
url.password = process.env.SUPABASE_DB_PASSWORD;
const db = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
await db.connect();

const summary = (line) => {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
};

const user = await db.query('select id from auth.users where lower(email) = $1', [email]);
if (user.rowCount) {
  // insert as well as update: an account whose profile row is missing must not be reported as done (22 Nov)
  const r = await db.query(
    `insert into public.profiles (user_id, is_admin) values ($1, true)
     on conflict (user_id) do update set is_admin = true returning (xmax = 0) as created`,
    [user.rows[0].id],
  );
  summary(`${email} is now an admin${r.rows[0].created ? ' (their profile was missing and has been created)' : ''}. Invite friends shows up in their Settings the next time they open Reelay.`);
} else {
  const inv = await db.query(
    `insert into public.invites (token, make_admin) values (public.new_invite_token(), true) returning token, expires_at`,
  );
  const { token, expires_at } = inv.rows[0];
  summary(`${email} has no account yet. Send them this admin invite link (works once, until ${expires_at.toISOString().slice(0, 10)}):`);
  summary(`https://usereelay.vercel.app/i/${token}`);
}
await db.end();
