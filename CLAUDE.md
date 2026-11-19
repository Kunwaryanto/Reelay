# Reelay

Where films and series stream in Sweden. A web app people add to their iPhone Home Screen (not an App Store app). Personal project: free, no ads, sign-in by email code only, no browsing without an account.

## Where the design lives

- Design canvas (screens, components, tokens): https://claude.ai/artifact/1Fo2PjsKmhJqA3Uiq76i35 — build only what is on the **Current** page. The In progress page is exploration.
- Design decisions doc (rules, open questions, decision log): https://claude.ai/artifact/3sRRqQPxj8P8R3RvcATcSx — start with its Handoff overview.
- `docs/build-notes.md` — the build notes from beside each Current screen.
- `src/styles/tokens.css` — every colour, type style, size, radius and motion value. Use the variables; don't hard-code values.

## Before building screens

Settle these first, they affect screens already designed:
- the rule for which award shows under a cover
- service marks for SVT Play and SkyShowtime

## Stack

- Vite + React + TypeScript, deployed on Vercel from `main` to https://usereelay.vercel.app.
- Supabase (database, auth with 6-digit email code). Everything Supabase is in `supabase/`:
  migrations in `supabase/migrations`, auth settings in `supabase/config.toml`, email template in `supabase/templates`.
  The Supabase GitHub integration applies new migrations when they reach `main`. Never change the database by hand in the dashboard; add a migration.
- Secrets live in GitHub Actions secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY`, `BREVO_SENDER_EMAIL`) and Vercel env vars. Never commit them.

## Rules

- Dark only. One grey (#808080) for meta, faint text and every inactive icon.
- Inter at opsz 32; Material Symbols Outlined weight 250, 24px.
- iPhone web app limits: shared links open in Safari, Safari and the installed app don't share storage, no background sync, no haptics.
- UI copy is English for now; Swedish copy is decided in the Supabase phase.
