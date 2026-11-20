// Turns an invite link into an account. Open sign-ups are off, so this is the only way in.
//
// POST { token }         → { status: 'valid' | 'expired' | 'used' }        (Start checks the link)
// POST { token, email }  → { status: 'created' | 'existing' } or an error   (Join Reelay → Send code)
//
// After 'created' or 'existing' the app signs in as usual with signInWithOtp({ shouldCreateUser: false }).
// An invite is only used up once its account has actually signed in: if someone typed the wrong
// email and never got the code, the same link still works with the right one.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://usereelay.vercel.app';
const cors = {
  'Access-Control-Allow-Origin': SITE,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  Vary: 'Origin',
};

function reply(body: Record<string, unknown>, status = 200, origin = '') {
  // the live site, Vercel's preview links for this project, and local development
  const allow = origin.startsWith('http://localhost:') || /^https:\/\/reelay-[a-z0-9-]+\.vercel\.app$/.test(origin) ? origin : SITE;
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Access-Control-Allow-Origin': allow, 'Content-Type': 'application/json' },
  });
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS') return reply({}, 204, origin);
  if (req.method !== 'POST') return reply({ error: 'method' }, 405, origin);

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return reply({ status: 'used' }, 200, origin);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: inv } = await admin.from('invites').select('*').eq('token', token).maybeSingle();
  if (!inv) return reply({ status: 'used' }, 200, origin); // cancelled, cleaned up or never existed

  // Has the person who used it signed in? Only then is the invite really spent.
  if (inv.joined_at) return reply({ status: 'used' }, 200, origin);
  if (new Date(inv.expires_at) <= new Date()) return reply({ status: 'expired' }, 200, origin);

  if (!email) return reply({ status: 'valid' }, 200, origin);
  if (!EMAIL.test(email)) return reply({ error: 'invalid_email' }, 400, origin);

  // Someone who already has an account just signs in; the invite stays unused.
  const { data: existingId } = await admin.rpc('user_id_by_email', { p_email: email });
  if (existingId) return reply({ status: 'existing' }, 200, origin);

  // A different email than last time, and that one never signed in: remove the unused account.
  if (inv.used_by) await admin.auth.admin.deleteUser(inv.used_by);

  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created?.user) return reply({ error: 'create_failed' }, 500, origin);

  await admin
    .from('invites')
    .update({ used_by: created.user.id, used_email: email, used_at: new Date().toISOString() })
    .eq('id', inv.id);
  if (inv.make_admin) await admin.from('profiles').update({ is_admin: true }).eq('user_id', created.user.id);

  return reply({ status: 'created' }, 200, origin);
});
