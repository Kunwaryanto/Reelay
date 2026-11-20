# Reelay

Where films and series stream in Sweden. A web app for your iPhone Home Screen.

Live at https://usereelay.vercel.app

## Run locally

```sh
npm install
cp .env.example .env.local   # fill in the Supabase URL and publishable key
npm run dev
```

## Layout

| Path | What |
|---|---|
| `src/` | The app (Vite, React, TypeScript) |
| `src/styles/tokens.css` | Design tokens exported from the design canvas |
| `public/manifest.webmanifest`, `public/icons/` | Home Screen setup |
| `supabase/` | Database migrations, auth config and the sign-in email |
| `docs/build-notes.md` | Build notes for each screen |

## Deploys

- **Site:** Vercel builds every push to `main`.
- **Supabase settings:** the `Supabase config` workflow sends `supabase/config.toml` and the email template to Supabase when they change.
- **Database:** the `Supabase migrations` workflow applies new files in `supabase/migrations` when they reach `main`.
- **Edge Functions:** the `Supabase functions` workflow deploys `supabase/functions` when they change.
- **Admins:** run the `Make admin` workflow with an email. An existing account becomes an admin; otherwise the run summary shows a one-time admin invite link.

See `CLAUDE.md` for links to the design canvas and decisions doc.
