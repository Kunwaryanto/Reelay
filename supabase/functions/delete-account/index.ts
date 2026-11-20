// Deletes the signed-in person's account. Their profile, services, watchlist and notification addresses go
// with it (those tables reference auth.users with on delete cascade); invites they sent or used stay, unlinked.
//
// POST with the person's own session in Authorization → { status: 'deleted' }

import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://usereelay.vercel.app';
const cors = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  Vary: 'Origin',
};

function reply(body: Record<string, unknown>, status = 200, origin = '') {
  // the live site, Vercel's preview links for this project, and local development
  const allow = origin.startsWith('http://localhost:') || /^https:\/\/reelay-[a-z0-9-]+\.vercel\.app$/.test(origin) ? origin : SITE;
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...cors, 'Access-Control-Allow-Origin': allow, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS') return reply({}, 204, origin);
  if (req.method !== 'POST') return reply({ error: 'method' }, 405, origin);

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return reply({ error: 'signed_out' }, 401, origin);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // who is asking: only ever the owner of the session that was sent
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return reply({ error: 'signed_out' }, 401, origin);

  const { error: failed } = await admin.auth.admin.deleteUser(data.user.id);
  if (failed) return reply({ error: 'failed' }, 500, origin);
  return reply({ status: 'deleted' }, 200, origin);
});
