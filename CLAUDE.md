# Reelay

Where films and series stream in Sweden. A web app people add to their iPhone Home Screen (not an App Store app). Personal project: free, no ads, sign-in by email code only, no browsing without an account.

## Where the design lives

- Design canvas (screens, components, tokens): https://claude.ai/artifact/1Fo2PjsKmhJqA3Uiq76i35 — build only what is on the **Current** page. The In progress page is exploration.
- Design decisions doc (rules, open questions, decision log): https://claude.ai/artifact/3sRRqQPxj8P8R3RvcATcSx — start with its Handoff overview.
- `docs/build-notes.md` — the build notes from beside each Current screen.
- `public/brand/wordmark.svg` — the Reelay wordmark as outlines (Inter Display SemiBold, -0.02em), `fill=currentColor`, one `<path class="l">` per letter for the Start rise. Always use it instead of typing “Reelay” in the font. `wordmark-email.png` is the black version for emails (email apps don’t show SVG).
- `public/icons/services/` — white service marks for poster corners (8–14px tall). SVT Play and SkyShowtime are their own wordmarks at 8px. `public/icons/ui/laurel.svg` — the award laurel.
- `public/fonts/` — self-hosted Inter (from rsms.me, opsz 32, weights 400–700) and a Material Symbols file with only our icons, declared in `src/styles/fonts.css`. Never load fonts from Google or another CDN (GDPR). New icon: add its name to `scripts/fonts/icons.txt` and run `scripts/fonts/build-icons.py` (instructions at the top of the script).
- `src/styles/tokens.css` — every colour, type style, size, radius and motion value. Use the variables; don't hard-code values.

## Stack

- Vite + React + TypeScript, deployed on Vercel from `main` to https://usereelay.vercel.app.
- Testing branch: `sprint-2` is the one staging branch (decided 20 Nov). New work is pushed there so its preview URL stays the same: https://reelay-git-sprint-2-kunwaryanto.vercel.app. Merge it into `main` when a round is approved. A Home Screen install can't be reloaded by hand, so the app notices a new deploy itself: a white dot by the Settings cog on Now, an Update card at the top of Settings, and a Version row under About that shows the build (commit) and opens a page where you can check for an update and apply it.
- Supabase (database, auth with 6-digit email code). Everything Supabase is in `supabase/`:
  migrations in `supabase/migrations`, auth settings in `supabase/config.toml`, email template in `supabase/templates`.
  The `Supabase migrations` workflow applies new migrations when they reach `main` (`supabase db push`); `Supabase status` lists what's applied. Never change the database by hand in the dashboard; add a migration.
  Invite only: open sign-ups are off; `supabase/functions/redeem-invite` creates the account from an invite link (`invites` table, `create_invite`/`cancel_invite`/`restore_invite` RPCs for admins, `profiles.is_admin`). The `Make admin` workflow makes someone an admin. Edge Functions deploy with the `Supabase functions` workflow.
  Letterboxd (staging since 22 Nov): a member types their username in Settings › Letterboxd; `supabase/functions/letterboxd` checks it and reads their public diary feed (`letterboxd.com/<name>/rss/`: films with TMDB id, date, rating, rewatch; latest entries only), and the nightly sync reads every connected member again. `letterboxd_accounts` and `letterboxd_logs` are written only by the server and readable by everyone signed in (the same things are public on Letterboxd); the owner can switch the poster check off or disconnect, which deletes their rows. Ratings are shown as numbers out of 5. Older history comes from the member's Letterboxd export: the app opens the ZIP on the phone and sends only the film rows to `supabase/functions/letterboxd-import`; imported rows are kept by film name and year and matched to the catalogue by `letterboxd_resolve` (at import and nightly), which also drops rows the feed already has.
  Home (`src/lib/home.ts`) is built per member: their services, their watchlist and their Letterboxd. It needs `titles.trend_rank` (TMDB's weekly trending, nightly), `title_recs` (TMDB's recommendations for films members rated 4+), and the functions `home_because`, `home_friends` and `home_taste`. The `Home data` workflow runs those sync steps by hand. Home is built again only when the sync's `data_stamp` moves (every sync run sets it), the day turns, or the member's watchlist or Letterboxd films change; never while the member is looking at it (`src/lib/homeData.ts`).
  Catalogue tables are readable by signed-in users only and written only by the sync; user tables (profiles, user_services, watchlist, push_subscriptions, invites) are private to their owner via RLS.
- Secrets live in GitHub Actions secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY`, `BREVO_SENDER_EMAIL`, and for notifications `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) and Vercel env vars (`VITE_VAPID_PUBLIC_KEY` is the same public key). Never commit them.

## Browser support

- **Target: Safari on iOS 26 and later**, as a Home Screen web app, and in Safari for Start, sign-in and invite links. Any feature that Safari on iOS 26 supports may be used without a fallback, even if it isn't Baseline Widely available.
- Features Safari doesn't support may only be used as progressive enhancement that falls back to the designed look (e.g. `corner-shape: squircle` falls back to ordinary rounded corners). No polyfills.
- Other phones (Android, Chrome) can use Reelay too, best effort: nothing may block them, but we design and test for iPhone.
- Exception: the "Made for your phone" desktop page must work in current Chrome, Edge, Firefox and Safari (Baseline Widely available).
- Front-end work uses the `modern-web-guidance` skill (`.agents/skills/modern-web-guidance`, from Google Chrome). Apply its guides with the target above; it does not apply to the sync, database or CI.

## Rules

- Dark only. One grey (#808080) for meta, faint text and every inactive icon.
- Inter at opsz 32; Material Symbols Outlined weight 250, 24px.
- No sharing of titles (dropped 20 Nov: links can't open the Home Screen app). Reelay is invite only: admins create single-use invite links in Settings.
- iPhone web app limits: links always open in Safari (or the service's own app, for its https links when it's installed), Safari and the installed app don't share storage, no background sync, no haptics.
- Sheets: `Sheet` (in `src/ui`) draws itself in `#root`, so it always covers the tab bar and opens from the bottom. Never wrap a sheet in `createPortal`: on the body, iOS scrolls the document when the sheet takes focus and it opens at the top of the screen.
- Fields: a tap on a text field is focused by the app itself without scrolling (`guardFieldTaps` in `src/lib/keyboard.ts`, installed once for every field), so iOS never jumps the page when the keyboard opens. Don't add per-screen versions; a field that moves with the keyboard itself opts out with `data-own-focus`.
- The first tab is called **Home** (renamed from Now on 22 Nov). In the code it is still `now` (`src/screens/Now.tsx`, the `now` tab id), and older notes say Now.
- Pages and links: every page that loads content has one entry in `src/lib/pages.ts` (what it loads, its key, the pictures it waits for); the page reads through it (`usePageQuery`) and preloads through it (`warmPage`). Every link or button that opens a page is a `PageLink`, `PageButton` or `ViewAll` from `src/ui` (or spreads `usePageLink`), so the page starts loading on press. A new page that loads content gets an entry in `pageFor`. Off production, a page opened by a tap that wasn't preloaded logs a `[pages]` warning in the console.
- View all: a row offers it only when its full list has more than the row shows. Home rows set it through `row()` in `src/lib/home.ts` (a target and the list the row was taken from); the lists behind Home's rows are Browse categories in the hidden `home` section. Don't add View all links by hand.
- UI copy is English for now; Swedish copy is decided in the Supabase phase.
