# Reelay

Where films and series stream in Sweden. A web app people add to their iPhone Home Screen (not an App Store app). Personal project: free, no ads, sign-in by email code only, no browsing without an account.

## Where the design lives

- Design canvas (screens, components, tokens): https://claude.ai/artifact/1Fo2PjsKmhJqA3Uiq76i35 — build only what is on the **Current** page. The In progress page is exploration.
- Design decisions doc (rules, open questions, decision log): https://claude.ai/artifact/3sRRqQPxj8P8R3RvcATcSx — start with its Handoff overview.
- `docs/build-notes.md` — the build notes from beside each Current screen.
- `public/brand/wordmark.svg` — the Reelay wordmark as outlines (Inter Display SemiBold, -0.02em), `fill=currentColor`, one `<path class="l">` per letter for the Start rise. Always use it instead of typing “Reelay” in the font. `wordmark-email.png` is the black version for emails (email apps don’t show SVG).
- `public/icons/services/` — white service marks for poster corners (8–14px tall). SVT Play and SkyShowtime are their own wordmarks at 8px. `public/icons/ui/laurel.svg` — the award laurel.
- `src/styles/tokens.css` — every colour, type style, size, radius and motion value. Use the variables; don't hard-code values.

## Stack

- Vite + React + TypeScript, deployed on Vercel from `main` to https://usereelay.vercel.app.
- Supabase (database, auth with 6-digit email code). Everything Supabase is in `supabase/`:
  migrations in `supabase/migrations`, auth settings in `supabase/config.toml`, email template in `supabase/templates`.
  The `Supabase migrations` workflow applies new migrations when they reach `main` (`supabase db push`); `Supabase status` lists what's applied. Never change the database by hand in the dashboard; add a migration.
  Catalogue tables are public to read (shared title pages) and written only by the sync with the service role; user tables (profiles, user_services, watchlist, push_subscriptions) are private to their owner via RLS.
- Secrets live in GitHub Actions secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY`, `BREVO_SENDER_EMAIL`) and Vercel env vars. Never commit them.

## Browser support

- **Target: Safari on iOS 26 and later**, as a Home Screen web app and in Safari (shared title pages). Any feature that Safari on iOS 26 supports may be used without a fallback, even if it isn't Baseline Widely available.
- Features Safari doesn't support may only be used as progressive enhancement that falls back to the designed look (e.g. `corner-shape: squircle` falls back to ordinary rounded corners). No polyfills.
- Exception: the "Made for iPhone" desktop page must work in current Chrome, Edge, Firefox and Safari (Baseline Widely available).
- Front-end work uses the `modern-web-guidance` skill (`.agents/skills/modern-web-guidance`, from Google Chrome). Apply its guides with the target above; it does not apply to the sync, database or CI.

## Rules

- Dark only. One grey (#808080) for meta, faint text and every inactive icon.
- Inter at opsz 32; Material Symbols Outlined weight 250, 24px.
- iPhone web app limits: shared links open in Safari, Safari and the installed app don't share storage, no background sync, no haptics.
- UI copy is English for now; Swedish copy is decided in the Supabase phase.
