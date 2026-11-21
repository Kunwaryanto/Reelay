// Sends the notifications people asked for, after each nightly sync:
//   leaving     a Watchlist title leaves one of your services tomorrow
//   arrived     a Notify me title started streaming (on your services, or anywhere if you picked none)
//   new_season  a Watchlist series got a new season
// Only about titles on someone's Watchlist, never twice for the same thing (notifications_sent), and only
// to people who left that switch on. One notification per title; three or more of a kind become one.
//
// Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (GitHub Actions secrets). Without them it does nothing.
import webpush from 'web-push';

const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:lukas.kunwaryanto@gmail.com';

const list = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

export async function sendNotifications(db, log) {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return log('notifications: no VAPID keys, skipped');
  webpush.setVapidDetails(SUBJECT, pub, priv);

  // Everything due, one row per person, title and kind. "Your services" means any service when none are picked.
  const due = (await db.query(`
    with mine as (
      select w.user_id, w.title_id, w.notify, a.service_id, a.leaves_on
      from public.watchlist w
      join public.availability a on a.title_id = w.title_id
      where not exists (select 1 from public.user_services u where u.user_id = w.user_id)
         or exists (select 1 from public.user_services u where u.user_id = w.user_id and u.service_id = a.service_id)
    )
    select 'leaving' as kind, m.user_id, m.title_id, m.service_id, m.leaves_on as ref_date
      from mine m join public.profiles p on p.user_id = m.user_id and p.notify_leaving
      where m.leaves_on = current_date + 1
    union all
    select 'arrived', m.user_id, m.title_id, m.service_id, e.happened_on
      from mine m join public.profiles p on p.user_id = m.user_id and p.notify_arrivals
      join public.availability_events e on e.title_id = m.title_id and e.service_id = m.service_id and e.event = 'added'
      where m.notify and e.happened_on >= current_date - 1
    union all
    select 'new_season', m.user_id, m.title_id, m.service_id, t.last_season_on
      from mine m join public.profiles p on p.user_id = m.user_id and p.notify_new_seasons
      join public.titles t on t.id = m.title_id and t.kind = 'series'
      where t.last_season_on >= current_date - 2 and t.last_season_on <= current_date and coalesce(t.seasons, 1) > 1
  `)).rows;
  if (!due.length) return log('notifications: nothing due');

  // one per person, title and kind (a title on two of your services is still one notification)
  const seen = new Set();
  const fresh = [];
  for (const d of due) {
    const key = `${d.user_id}:${d.title_id}:${d.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { rowCount } = await db.query(
      `insert into public.notifications_sent (user_id, title_id, kind, ref_date) values ($1,$2,$3,$4) on conflict do nothing`,
      [d.user_id, d.title_id, d.kind, d.ref_date],
    );
    if (rowCount) fresh.push(d);
  }
  if (!fresh.length) return log(`notifications: ${due.length} due, all sent before`);

  const ids = [...new Set(fresh.map((d) => d.title_id))];
  const titles = new Map((await db.query(`select id, title, seasons from public.titles where id = any($1)`, [ids])).rows.map((t) => [Number(t.id), t]));
  const services = new Map((await db.query(`select id, name from public.services`)).rows.map((s) => [s.id, s.name]));
  const subs = (await db.query(`select id, user_id, endpoint, p256dh, auth from public.push_subscriptions where user_id = any($1)`, [[...new Set(fresh.map((d) => d.user_id))]])).rows;

  // what each person gets
  const messages = [];
  const by = Map.groupBy(fresh, (d) => `${d.user_id}:${d.kind}`);
  for (const group of by.values()) {
    const { user_id, kind } = group[0];
    const one = (d) => {
      const t = titles.get(Number(d.title_id)), svc = services.get(d.service_id) ?? 'a service';
      const body = kind === 'leaving' ? `Leaves ${svc} tomorrow.` : kind === 'arrived' ? `Now streaming on ${svc}.` : `Season ${t.seasons} is out on ${svc}.`;
      return { user_id, title: t.title, body, url: `/title/${d.title_id}?n=${kind}`, tag: `${kind}-${d.title_id}` };
    };
    if (group.length < 3) { messages.push(...group.map(one)); continue; }
    const names = group.map((d) => titles.get(Number(d.title_id)).title);
    const shown = names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} more`] : names;
    const title = kind === 'leaving' ? `${names.length} titles leave tomorrow` : kind === 'arrived' ? `${names.length} titles are now streaming` : `${names.length} new seasons are out`;
    messages.push({ user_id, title, body: `${list(shown)}.`, url: '/watchlist', tag: `${kind}-many` });
  }

  let sent = 0, gone = 0, failed = 0;
  for (const m of messages) {
    for (const s of subs.filter((x) => x.user_id === m.user_id)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag }), { TTL: 12 * 60 * 60 });
        await db.query(`update public.push_subscriptions set last_ok_at = now() where id = $1`, [s.id]);
        sent++;
      } catch (e) {
        // the device is gone (app removed, notifications turned off): forget its address
        if (e.statusCode === 404 || e.statusCode === 410) { await db.query(`delete from public.push_subscriptions where id = $1`, [s.id]); gone++; }
        else { failed++; log('  notification failed:', e.statusCode ?? e.message); }
      }
    }
  }
  log(`notifications: ${messages.length} for ${new Set(messages.map((m) => m.user_id)).size} people, ${sent} delivered to devices, ${gone} old devices removed${failed ? `, ${failed} failed` : ''}`);
}
