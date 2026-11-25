# Testing

Browser tests live in `tests/e2e` (Python, pytest and Playwright). They run the **built** app in Chromium at
iPhone size (390 x 844, touch) against a mock Supabase and mock TMDB pictures (`tests/e2e/mock_api.py`), so they
need no network or account. Run them before every push to `sprint-2`. The `Browser tests` workflow runs them on GitHub only when app code
reaches `main` (with lint and the vercel.json check), to stay within the free Actions minutes.

What they cover: every kind of address and the tab bar (`test_routes`), Home loading only after a sync and never
swapping under you (`test_home`), preloading on press (`test_preload`), pull to refresh (`test_pull`), the launch
wordmark (`test_launch`), pictures loading ahead (`test_pictures`), the long-press menu (`test_hold`), pruning
what's saved on the phone (`test_storage`) and accessibility with axe-core (`test_accessibility`).

Run them locally:

    VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=mock-key npm run build
    npx vite preview --port 4317 &
    pip install -r tests/e2e/requirements.txt && python -m playwright install chromium
    python -m pytest tests/e2e -q

They run four at a time (pytest-xdist, `-n 4` in `tests/e2e/pytest.ini`; about 2.5 minutes instead of 6). Add
`-n 0` to run one at a time, or `-k name` for one test. After opening a page, wait with `pg.settle(cap)`, which
returns as soon as the page is quiet (no request open, no short animation running), not with a fixed
`wait_for_timeout`: a fixed wait makes every run as slow as the slowest and still fails when tests run in parallel.
Keep fixed waits for things that really take time (a timer, a hold, a spinner's minimum).

A new screen or behaviour gets a test here; new data a screen asks for gets a mock in `mock_api.py` (an unknown
request is answered 404, which usually shows as a screen that never loads).
