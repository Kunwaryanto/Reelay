# Build notes

Copied from the notes beside the screens on the Current page of the design canvas (19 Nov 2026). The canvas is the source of truth; update this file when a note changes.

## Launch and loading

• Launch is black with the tab bar in place from the first frame. Home counts as ready when its data is in and the hero art and first row are decoded.
• Ready within 300 ms (the usual cached launch): no wordmark, Home rises: hero art fades in from 104 %, then title + meta (160 ms), indicator + settings (240 ms), rows (300 ms on).
• Not ready by 300 ms: the Reelay wordmark rises on black and always finishes (≈900 ms) before handing off. Still waiting at 3.3 s: grey placeholders, content rises over them.
• Back from the background: no animation.
• Everywhere else: switching tabs is instant; only content that arrives late rises in (8 px, 500 ms), with placeholders after ≈400 ms. Never the wordmark.
• Keep it instant: cache Home, Browse and Watchlist and refresh in the background; after launch, load each tab's first screen and the hero titles' Detail ahead; every poster carries a tiny blur preview, so placeholders show its colours; request posters at display size; start a Detail page loading on touch-down.

## Notifications in the app

• iOS writes the permission dialog; we only choose when it shows: after Continue in onboarding, or when someone turns a notification on (a toggle in Settings, Notify me on a title) before they have been asked.
• Blocked in iOS: Settings shows a small panel (Notifications are off · Turn them on in iOS Settings · Settings pill opening Reelay's iOS settings page); the toggles dim and can't change.
• Notify me always saves the title. Toast: “We’ll let you know when it’s on.” with Undo, or “Notifications are off for Reelay.” with Settings. 4 s.
• Tapping a notification opens the title's Detail page; the matching where-to-watch row lights up once in surface grey and settles (≈1.5 s), its note in white: Leaves tomorrow / New / New season.

## Scores build-up (22 Nov)

- MDBList is asked 200 titles at a time (its batch lookup). The first batch of each run is measured (usage before and after) and the log says what it cost: one request per batch means the whole queue is worked through, one per title means as many titles as the day's allowance has left, and if batches fail the step asks one title at a time as before.
- Queue: never fetched first, then older than 30 days; within each, titles on someone's Watchlist, then the most popular. A title that doesn't come back is saved empty and asked for again in a week, so it no longer sits at the front every night.
- OMDb backs up the critics' score for films only, where MDBList has none (compared 22 Nov on recent films: identical where both had one; OMDb had some big films MDBList missed, and almost no series). Order: Watchlist, then films with 5,000+ IMDb votes, then the rest (still asked, last), each by popularity. Each film is asked about once a month at most; up to 950 a run (free plan 1,000 a day). MDBList's score wins when it has one; an OMDb score is kept while MDBList has none (`scores.omdb_synced_at`).
- The `Scores` workflow runs just this step by hand (`SYNC_ONLY=scores`); the nightly sync still does it every night.

## Pressed, busy, disabled, focused (22 Nov)

- Every control answers the finger. Self-contained shapes shrink (`scale`, so it never fights their own animations): icon buttons 0.9, pills and chips 0.96, Browse cards 0.97 (after 80 ms, so scrolling doesn't nudge them), tab bar icons 0.88; the white buttons and posters already did. Text actions (View all, Skip, quiet buttons) and full-width rows (Settings, drawer options) dim to 50% instead; rows wait 80 ms. Long-press menu items tint like its header.
- Busy buttons (`aria-busy`) take no second tap. Disabled buttons are 40% and dead, except the filter drawer's Show button, which keeps its own grey.
- Keyboard and Switch Control get one white 2px focus ring; a finger never shows it. No hover states (no pointer) and no haptics (not available to a Home Screen web app).
- Title page ratings: Rotten Tomatoes' audience score shows as “Popcornmeter” after the Tomatometer (`scores.rt_audience`, filled by the nightly sync from the same MDBList answer; about a month to cover the catalogue).

## Watchlist feedback (22 Nov)

- Adding has no toast. On the title page the bookmark button shows it: the fill flows in (260 ms) and the icon pops with a ring; removing empties it with a dip, also without a toast (the button is right there to undo). In the long-press menu the item uses the same bookmark, empty to add and filled when saved, with no animation: the menu closes at once. “Removed … Undo” stays for the long-press menu and the Watchlist's swipe, where the title leaves the screen. Reduce Motion: the fill still changes, nothing moves.

## Long press on a poster (try it on Now)

• Like iOS, scrolling always wins: rows keep native horizontal swipe (no touch-action or preventDefault on cards), the page keeps vertical scroll. The hold only starts a timer; moving more than 8px before 0.45 s, or the browser taking over the gesture (pointercancel), cancels it. A tap that stops a moving row doesn't open anything.
• Press feedback waits 90 ms, then the poster sinks slowly to 95% over the hold; a finger that lands only to scroll never moves it. A quick tap still shows a brief press.
• The lifted poster is a copy of the one on screen (same image and service mark) starting at the pressed size; the original is hidden while the menu is open. The backdrop blur itself animates in.
• Hold 0.45 s without moving. The poster lifts into a larger preview, the screen and tab bar blur, a glass menu grows from under it. Tap outside: it settles back.
• Menu = the actions from the title page, never new ones. Title as a small header, then:
  – Default: Add to / Remove from Watchlist, Open in [service].
  – Watchlist: Remove from Watchlist (red) first, Notify me, Open in [service].
  – Not streaming in Sweden: Notify me instead of Open in.
• On every poster and title card: Now rows, Browse, categories, Search, Watchlist, Person, More like this. Not on the Now hero (swipe), cast, pills or settings rows.
• Turn off Safari’s link menu on posters (-webkit-touch-callout: none, no selection). No haptics on the web. Reduce Motion: fade only.

## Award line on title cards

• Only where the award is the point: award rows on Now (Oscars, Emmys) and Search with an award filter on. Everywhere else cards keep their normal meta line; the title page lists every award.
• The row names the award, so the line shows the top category in that award, then “+n” for the other wins (or, for a title that only has nominations, the other nominations): “Best Miniseries +7”.
• Top category: a win beats any nomination; then Best Series / Film / Miniseries; lead acting; directing, then writing; supporting acting; everything else. Same level: the most recent year.
• Short category names (“Outstanding Limited Series” → “Best Miniseries”).
• “+n” never truncates; the category name does. Laurel is outlined like every other icon, three open leaves per branch on the 24px grid (public/icons/ui/laurel.svg, uses currentColor). Won in #D6D6D6, the same as the title above it; nominated in grey #808080. No gold anywhere.
• Counts come from the same award rows the title page lists (v275, option C).

## Start and sign in

• Wrong code and a rejected email shake (no haptics on the web). Never on expired, too many tries or a failed send.
• Poster wall: the camera mostly sways sideways; every column keeps climbing (at least 48 px/s, bob capped at 12 px/s), so no row lingers on the same posters. Same wall on Start, sign-in states and the install card.
• Poster wall is drawn on one canvas (hundreds of animated layers flickered on iPhone). It fades in once most posters are decoded; late ones fade in one by one. Posters come from start_wall(): 12 each of recent films, recent series, classic films and classic series, mixed (recent = last five years, classic = 15 years and older).
• Intro (20 Nov): each wordmark letter starts invisible about one and a half letters low, rises and fades to white, 55 ms apart. As the last letters land (0.7 s) the button rises 24px from nothing, the invite line 80 ms later, same easing. This intro is Start's own; in-app content keeps the 8px rise.
• Reduce Motion: no shake, no letter rise, wall stands still; red outlines and messages stay.
• Code only: the email carries the 6-digit code and no link (a link would sign in Safari, not the installed app). Code length, expiry and attempt limits come from Supabase Auth. The resend countdown is 60 s.
• Email field: autocomplete="email"; code field: autocomplete="one-time-code" for the From Mail suggestion (iOS only suggests codes from Apple Mail and Messages, not the Gmail app). Safari offers contact details through its AutoFill button, not as a typed suggestion; a page can't change that.
• After signing in, the email is kept on the phone (localStorage) and filled in the next time sign-in opens. Signing out keeps it. The privacy policy should mention this.
• Code: a real input sits transparent over the six boxes, so typing, pasting and Mail autofill all work. Any six digits in pasted text count. It is checked as soon as six digits are in, and goes in by itself 0.7 s after success (no Continue button, no Paste button). Signing in always lands on Now.
• Home Screen app: sign-in is a sheet that never moves with the keyboard (a web page can't follow the iOS keyboard smoothly). The first time on a phone it waits invisibly for the keyboard, measures the room it takes, stores it and slides up; after that it opens straight away at that height. The height is constant, keyboard open or closed. Drag down anywhere on it (not on fields) to close.
• Safari: sign-in is its own page (slides in from the right; back button or Safari's back swipe closes it), field at the top. Safari moves its whole visible area around its bars when the keyboard opens, which a sheet can't hide. The tap on Sign in focuses a stand-in field so the keyboard opens with the page.
• Reelay is a web app. In Safari on iPhone, when it isn't installed yet, the start screen shows the Add to Home Screen card (iOS 26 steps: ••• → Share → Add to Home Screen → Add). Older Safari layouts have Share in the toolbar: show two steps there. “Sign in here” opens sign-in; don't show the card again each visit, remind once when someone turns on a notification (those need the installed app).

• Invite only (v287): without a link the glass button says Sign in, 120px from the bottom; “Reelay is invite only.” sits alone 40px from the bottom (12px, grey). No terms line.
• From a valid invite link: Join Reelay and “You’re invited.”, and the email sheet is titled Join Reelay (otherwise “Continue with email”). It never says who sent it.
• Start in Safari (not yet installed): the Add to Home Screen card for people with an account, quiet “Sign in here”. After joining with an invite: “You’re in. Add Reelay to your Home Screen”, the same steps, “Then open Reelay from your Home Screen and sign in once more.” (Safari and the app don’t share sign-in), quiet “Continue here”.
• Built 22 Nov: the card shows in an iPhone or iPad browser tab (never in the Home Screen app, never on Android) until “Sign in here” has been tapped once on that phone (`reelay:install-seen`); an invite link shows Join Reelay first and the “You’re in” card after the code is accepted, where “Continue here” goes on into the app. Three steps for iOS 26; the two-step variant for older Safari layouts is not built (target is iOS 26). `?install` in the address shows the card on any device, for testing.
• Never name Safari in buttons: we only know it’s a browser. Invite links often open in WhatsApp’s or Instagram’s own browser, where Add to Home Screen isn’t available; spot those loosely (user agent) and first say “Open this page in Safari”.
• An email without an account gets “Reelay is invite only” in the sheet instead of a code, with Use another email. An expired or used link opens the sheet with the reason and “I already have an account”.
• No privacy or terms line on Start or in the sheet while Reelay is invite only among friends; the privacy policy and terms live in Settings › Privacy. If Reelay opens up, bring the line back (archived Start v18).

## Invite friends (admins only)

• Settings › Invite friends sits under Your services, only when profiles.is_admin. The row shows “n waiting”.
• The page: one line on how links work, then “+ New invite link”, the 32px grey pill. It calls create_invite() and opens navigator.share with “You’re invited to Reelay” and https://usereelay.vercel.app/i/<token>.
• Sent list from the invites table: Waiting (joined_at null and not expired; “works until <date>”; Cancel calls cancel_invite, Undo calls restore_invite with the removed row), Joined (used_email, “Joined <date>”), Expired. The nightly sync removes joined and expired ones after 30 days.
• /i/<token> opens Start. Ask redeem-invite with { token }: valid → Join Reelay; expired or used → the sheet with the reason. On Send code ask it with { token, email }: created or existing → signInWithOtp({ shouldCreateUser: false }) and the usual code. Without a link, signInWithOtp with shouldCreateUser false; a “signups not allowed” error means no account → the “Reelay is invite only” sheet.
• An invite is spent only at the account’s first sign-in (joined_at), so a mistyped email doesn’t burn the link.

Built 20 Nov (`src/screens/Invites.tsx`, `/settings/invites`). Beyond the spec: tapping a waiting row shares that link again; where the share sheet is missing the link is copied ("Link copied").

## Page slides (20 Nov)

Push and pop draw the slide with transform animations (Web Animations, run off the main thread) instead of moving the strip's scroll position each frame, so a page still rendering can't make it stutter. The leaving page's slower slide and dim are part of those animations; the scroll-driven `pane-leave` only runs for the finger's swipe back. The parallax runs on `.pane-in`, never on the `.pane` snap area: Safari snaps to the transformed box, so a moving snap area left the strip stuck halfway after a swipe. Components that only navigate use `useNavActions()`, so poster rows don't re-render on every push or scroll.

## Settings (built 21 Nov, `src/screens/Settings.tsx`, `src/screens/Legal.tsx`, `src/lib/profile.ts`)

- Board v296. Pages: Your services, Region, Credits, Privacy, Delete account (plus Invite friends), and the privacy policy and terms at `/privacy` and `/terms`, which can also be read signed out.
- **Testing** (admins only since 22 Nov): one row, Show onboarding again. The App links test page is removed (the link formats are settled), and `/onboarding` only replays for admins.
- **Version** (22 Nov, no board): the row under About shows the build (or “Update ready”) and opens its own page: Installed (the build), Status (Checking…, Up to date, A new version is ready, You’re offline) and one button, Check for update, which becomes Update when a new version is out. The page checks once when it opens. Under it, “Last problem” shows the most recent failed load since the app opened (only when there is one), selectable to copy. The screen-size readout under Testing is gone. The Update card at the top of Settings stays.
- **Your services** saves each tap to `user_services`. Watchlist, Search and Browse read the same cached list (`my-services:<user>`), and `setQueryData` updates every screen showing it at once.
- Services (22 Nov): the nine popular ones, then under More: Cineasterna (free with a library card), MUBI, Crunchyroll, Curiosity Stream, Pluto TV, Draken Film, TriArt Play, Hayu, BritBox. Paramount+ from the canvas list is left out (replaced by SkyShowtime in Sweden). The five added 22 Nov have no leaving dates, logos or app links yet; the sync finds their TMDB provider by name and logs any it can't find.
- **Notifications:** three switches on the profile. The first one tapped asks iOS for permission. In Safari (no Home Screen app) or when iOS has them blocked, a card says so and the switches dim. Sending them is the notifications piece.
- **Get a copy of my data** builds the copy on the phone and opens the share sheet (the design promised an email within days).
- **Delete account** calls the `delete-account` Edge Function, which removes the auth user (the user tables cascade). Functions deploy from `main`.
- Language is left out until there is Swedish copy to switch to.
- A temporary Testing section stays at the bottom (Reload, Show onboarding again, build and layout numbers).

## Offline and notifications (built 21 Nov)

- **The Offline pill** shows only after a request couldn't reach the server (the connection, not a server error), and "Back online" only after it had shown. A load the server refused shows where it happened and is listed under Settings › Testing ("Last failed load"). The pill drops in, lifts away, and its words cross-fade.

- **Service worker** (`public/sw.js`, registered from `src/lib/push.ts`): pages come from the network when there is one, so a new version shows at once; the last copy is used only when the network fails or takes over 3 s. The app's own files are kept after first use. The database and TMDB pictures are left alone: what shows offline comes from the answers the app saves itself (`useQuery`) and the browser's own picture cache. Not done from the offline note: keeping the last 300 posters ourselves, and searching saved titles offline.
- **Notifications:** the app registers the device's address in `push_subscriptions` once notifications are allowed (Settings switches, Notify me, onboarding), refreshes it on launch and removes it on sign-out. It needs `VITE_VAPID_PUBLIC_KEY` in Vercel.
- **Sending** (`scripts/sync/notify.mjs`, end of the nightly sync): leaving tomorrow, arrived (Notify me titles) and new season, per the profile switches, never twice (`notifications_sent`); three or more of a kind become one that opens the Watchlist. Copy from the lock screen board (v269). Needs `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as GitHub Actions secrets; without them the step is skipped.
- **Opened from a notification** (v232): the address carries `?n=<kind>`; the title page's first where-to-watch row lights up once.

## Launch (built 21 Nov, in `src/screens/Now.tsx`)

Built to the Launch and loading note above: ready = data in and the first hero picture decoded (2.5 s at most for the picture). Ready within 300 ms: hero art fades in from 104%, title and meta at 160 ms, dots and settings at 240 ms, rows from 300 ms, 60 ms apart. Otherwise the wordmark rises and holds until 1.2 s; still waiting at 3.3 s shows grey placeholders. The staged rise plays once per launch, not when coming back to the tab.

## Desktop and onboarding (21 Nov)

- **Desktop** (`src/screens/Desktop.tsx`, v290): any device without a touch screen, or with a screen at least 700px both ways, gets "Made for your phone" and a QR code to this site's own address (the invite link itself when opened from one). The code is generated in the build with `qrcode-generator`. `?app` in the address shows the app anyway, for testing on a computer.
- **Onboarding** (`src/screens/Onboarding.tsx`, v211, rebuilt 22 Nov as the animated flow): one wall of posters (the first 36 picks, six columns, each column three times over) and one camera. Three steps, each skippable: Services (tiles five across, the rest in a More sheet), Pick titles (drag to look around, tap to choose, Add n to Watchlist), Notifications (lock screen: today's date and time, three example notifications on glass, the switches). Continue on the last step asks iOS for permission if any switch is on. Shown once, when `profiles.onboarded_at` is empty; Settings › Testing shows it again.
- Timings are the board's: the wall waits for its posters (1.5 s at most), fades up over 1.6 s while the columns drift in and the camera settles (2.7 s), UI rises at 1.3 s. Step change: UI fades (200 ms) on the frame the camera starts (1.4 s to Services and Pick, 0.9 s to Notifications with an 8px blur), new UI at 700 ms (440 ms on Notifications), controls live when it has settled. Posters for services you don't have are dimmed on Services (black overlay 82%, grey flips under it); back on Services the dimming sweeps bottom to top from 450 ms. Notifications land oldest first, 90 ms apart; switching one off swipes its example away, on lands it again. Leaving (slowed 22 Nov, the board's 0.9 s felt abrupt on the phone): UI and cards fade (300 ms), the blur lifts and the camera drifts in (1.35 s, eased in and out) as the wall sinks to black (0.8 s), then the layer fades away (600 ms from 0.7 s) over Now, which rises (700 ms) with its tab bar in place; done at 1.35 s (1.85 s was tried and felt slow).
- The wall is sized against the board's 390 × 844 (`--k`), so it covers any iPhone the same way. Reduce Motion: no camera move, drift or card movement; fades only.
- Services (22 Nov): tiles show the services' own white logos (`public/icons/services/logos`, from the canvas), each at about the same area. Netflix, HBO Max and SVT Play are on to start with when you have no services yet, so the wall shows at once what picking does; the choice is saved on Continue, and Skip saves nothing. Shown again from Settings it is a test run: it always starts from those three and saves nothing (no services, no Watchlist titles, no notification choices) and doesn't ask iOS for permission. It ends like the real one: on Now, with the same hand-off (`home()` in the nav drops the Settings pages under it as it starts to leave).
- The wall holds the four most popular titles of each of the nine services (`loadWall`), placed so every service has posters in view on the Services step (slot (row, column) takes service (column + 3 × row) mod 9).
- Changed 22 Nov from the board's cues: a step's text and controls rise in together (no stagger); the camera between Services and Pick eases in and out (`cubic-bezier(0.65, 0, 0.35, 1)`, still 1.4 s) instead of jumping off; the wall opens fully dimmed and the posters of the services that are on light up when the UI arrives (1.3 s), as one slow fade from grey to colour (1 s; the grey itself fades here, unlike later toggles where it flips under the dim).
- First step in step (22 Nov): the tiles' logos are loaded before the wall starts and the black fade behind the tiles arrives with the UI (300 ms, no delay); before, the logos popped in a frame late and the fade trailed the heading and button.
- The picked outline is 0.7px on the wall, a little over 1px on screen at the Pick zoom.
- `.ob` and the wall clip (`overflow: clip`), never `hidden`: a hidden box can still scroll, and iOS scrolled it up to the More sheet when the sheet took focus, leaving the sheet far too high.
- Differs from the board: Services has no back button (there is nowhere to go back to).

## Not available, Notify me permission, long press on rows (21 Nov)

- **This title / person isn’t available** (v272): the Start poster wall at 62% black, the heading with a soft shadow and a glass Search pill; Back and the tab bar stay. Shown for a removed title or person and for an address the app doesn't know.
- **Notify me** asks iOS for permission the first time (inside the tap). Blocked: it says so and doesn't turn on. In Safari it saves and says notifications need the Home Screen app.
- **Long press** now also works on Watchlist rows and Search rows, with the same menu. The small row poster lifts to about 150px wide.

## Person (built 21 Nov, `src/screens/Person.tsx`)

- Board v231. Opened from the cast on a title page and from People in Search (`/person/<id>`).
- Shows what the catalogue has: photo or initials, name, what they're known for and how many of their titles Reelay has; role pills with counts when there is more than one role; the grid with year and character or job; Sort (Newest, Oldest, A–Z), Type, and Only on my services once services are picked.
- Not there: birth details, the biography and the Awards section. The catalogue doesn't store them.
- Search: a plain name query also looks up people (names starting with the words first). Two show under All, all of them under a People pill.

## Browse (built 21 Nov, `src/screens/Browse.tsx`, `src/lib/browse.ts`)

- Boards: Browse, Category, Grid · mixed list, Grid · typed list (all v121).
- A category is a set of filters over streaming titles, defined in code (`CATEGORIES`); nothing is stored in the database. Genres, decades and countries open a category page (top three as the hero, then rows); lists open straight as a grid.
- Routes: `/browse/all/<section>` (every card in a section), `/browse/c/<category>[/film|series]`, `/browse/g/<category>/<row|list>[/film|series]`. The Films/Series pill on Browse carries into the page it opens.
- Counts on type pills (Browse lists, Watchlist, Search, Person): a pill shows no number and takes no room for one until the list is loaded (never 0 while loading). When the number lands the pill eases wider over 220 ms as the number fades in (`PillCount`; a 0fr to 1fr grid column). No motion with Reduce Motion.
- Switching a type pill (Search, Browse lists, Watchlist, person page): every switch plays the list's entrance, the short staggered fade of Search results (`pill-in`, `useSwitched`; grids step per row of three), also when the new list shows the same titles. Never on first showing. Posters already loaded are there from the first frame (the first ten result rows load eagerly and decode in step).
- View all on the home rows: each row opens the Browse page for the same thing (Leaving soon and Highest rated their lists; 2000s, 90s, Crime, Comedy, Drama their category pages), and starts loading it on press. The home row "Crime and thrillers" became "Crime" to match. New Browse list "Leaving soon" (first under Lists): titles leaving a service within 30 days, soonest first, each with its leaving date; its sort drawer adds "Leaving first". It takes the 90 most popular of those leaving.
- Loading ahead of the scroll: a poster in a grid and a row in Search results load their picture once they're within a screen and a half of what's showing (`useNearScreen`, one observer per page, measured against the page's own scroller); poster rows do the same for the whole row. Safari's own lazy loading only starts when a picture is almost on screen.
- First frame: `index.html` sets html and body black on the elements themselves (painted as the very first tags are read) and html, body and #root black in an inline style. Without it the page is Safari's dark-scheme grey until the stylesheet arrives, which showed as a one-frame grey flash when opening the app. Still seen now and then (22 Nov, one frame of #121212 between iOS's launch screen and the page's first paint): that frame comes before the page exists, so it is WebKit's own dark default and the page can't colour it; if it keeps showing, the remaining lever is a black `apple-touch-startup-image` per iPhone size.
- Tab bar and top bar going faint and coming back: 320 ms out, 260 ms back, on an even curve (`--dur-nav-hide`, `--dur-nav-show`, `--ease-nav`). Measured against Are.na, whose bars take about 170 to 200 ms with the change spread evenly; ours spent nearly all of it in the first two frames, so it read as a snap.
- Toast: the Search field's glass (`--fill` over `--glass`, `--blur-glass`). Arrives from 28px below on a soft spring (`--dur-toast-in` 480 ms, `--ease-spring`, 5% past then settles) with a 200 ms fade; leaves by easing 24px down and fading (`--dur-toast-out` 240 ms). A plain message stays 2.2 s, one with an action (Undo) 4 s; a finger on it or focus on its button holds it. Drag: follows the finger down and resists upward (10px at most); let go past 20px or on a quick flick down and it leaves from where it is, otherwise it springs back and its time starts over. "Added to Watchlist" has no Undo: the same button removes it again, and removing has Undo. Reduce Motion: fades only.
- Long-press menu (sketch E, 22 Nov): 290 wide. Header: the name (15/20 medium, white), a facts line (Film · year · length · two genres; series: years · seasons · genres), "Directed by" (films) or "Created by" (series) with up to two names in the lighter grey, the scores (IMDb, RT, Letterboxd), and "Leaves <service> …" in grey when it leaves within 30 days. No plot and no "On <service>": the Open in row says where. Kind and year show at once; the rest comes from the title's facts (`lib/facts.ts`), fetched light and early: for every poster and row as it comes near the screen, one request per batch of titles, and at once for the one under a finger; late lines fade in (240 ms). Room is kept for the name and score lines while that loads; a line the title turns out not to have is then dropped, so the header is as tall as its lines and the space under the last line is always the same (13px). The name sits 10px above the facts, the same gap as between the facts and the scores.
- Title page meta, three lines: the facts (Film · year · length), then "Directed by" / "Created by" with up to two names (names in the lighter grey, as in the long-press menu), then the genres (series: episode length · genres). The Details list keeps its full row.
- Saving and the Watchlist: a title saved from a poster's long-press menu or its title page is put into the Watchlist's own list at once, from what the screen already shows (name, year, poster, services), so opening the Watchlist shows its row in place. 600 ms after a save the list is refreshed quietly to fill in genres, rating and length. A row that still arrives while the Watchlist is showing (a slow save, another device) opens up and fades in over 320 ms; rows are never popped in.
- Watchlist row swipe (like a row in iOS Mail): the row follows the finger exactly, from where the swipe was recognised (no jump), written straight to the element (`--x`), not through React. Swiped right it gives 14px at most. Remove sits behind and is as wide as what the row uncovers (80 at least). Let go past 44px, or on a leftward flick: it rests open at 88px. Remove is the word only, no icon (13/17 medium, white). Past 55% of the row Remove is "full" (the word moves to its leading edge); letting go there, or a hard flick past 120px, removes: the row slides away (200 ms), the list closes up (220 ms), then the toast with Undo. Settling uses `--ease-sheet`, 320 ms. Tapping Remove plays the same exit.
- Pressed posters and rows: when a page opens, the poster or row that was pressed is put back to its normal size at once (`lib/press.ts`, called from `push`). Its ease back was otherwise cut short as the page covered it on iPhone and played out on coming back, as a poster growing from small to normal.
- Top picture swipe (Home and category pages): read from touch events and claimed on its first sideways move. On a pushed page the strip of pages scrolls sideways too, and iOS took the swipe for that, so the picture never changed. A swipe starting within 28px of the left edge is left alone (it goes back).
- Long-press menu: tapping the name and facts, or the lifted poster, opens the title's page; the menu and poster fade where they are (180 ms) as the page slides in (flying the poster back put it on top of the arriving page). The lift of the finger that opened the menu doesn't count, on any row: with a poster low on the screen the menu opens right under that finger, so taps are taken from 350 ms after it is up, and rows show a press only from then. The header is not a link: iOS lifts a link under a resting finger into its own preview with the address.
- Pages arriving (a category, View all, a title, a person, a Browse section's View all, and the Browse tab itself): placeholders show the moment the page opens (a heading and posters under the dark top picture; posters three across fading out down the page; a title's first lines). The page waits for its answer and the pictures above the fold (top picture, title logo, first posters; at most 2.5 s for the pictures), then everything fades in as one piece over 400 ms with no movement (`--dur-arrive`, `useArrival`, `Skeleton`) while the placeholders fade out. A page shows at once, with none of this, only when its answer is saved and its pictures above the fold are already decoded (pictures decoded this session are remembered, and such posters skip their own fade). Type-pill counts arrive with the posters. Posters the page waited for are asked for at once (never lazy) and decoded with the frame they are painted in (`decoding="sync"`), and the decoded pictures are held in memory (newest 80): left lazy, the grid's posters started loading only after the fade had begun and popped in one by one (seen 22 Nov on View all from Now). Later the same day, lists opened from Browse still faded in with posters painting: Browse warms those lists while idle, the page then asked for the same pictures again, and Safari refused the second `decode()`, which counted as ready. Now each picture has one request that every asker joins, a refused decode waits for the picture to load instead, and grids wait for 12 posters (four rows), not 9. On the Browse tab the heading and pills show at once and only the cards wait (the first two sections' covers); switching Films/Series afterwards keeps its own card animation. A person page waits for the profile picture and the first nine posters. Not used on the Watchlist (already on the phone, updates in place), Search results (change as you type) or Settings pages (short text that answers in a blink, where placeholders would only flicker).
- Loading ahead: a press on a category card, a View all or a poster starts loading that page and its pictures above the fold before it opens (`prefetch`, `warmPictures`; a finger still for 80 to 100 ms or lifted without moving, so scrolling doesn't trigger it). Two seconds after Browse settles, the pages of its first four cards load ahead.
- Open in links: plain https links to the service's title page open the service's app when it's installed (tested 21 Nov: Netflix, HBO Max, Disney+, Apple TV; the others open the right page on the web). Stored in two parts: `services.link_base` (e.g. `https://play.hbomax.com/`) and `availability.link_path` (e.g. `movie/710798da-…`); a link not starting with its base is kept whole. Filled by the nightly sync from Streaming Availability: each service's catalogue once, page by page over several nights (subscription and free only, most popular first; where it stopped is in `sync_state`), then each night only the titles added since the last run. A link is never refetched; a title that leaves loses its row and gets a fresh link when it returns. At most 80 requests a night (free plan: 100 a day; leaving dates are read first, the whole list, up to 30 pages, and links get what is left of 95). Not covered yet: SVT Play, Viaplay, TV4 Play (they keep the search link). Settings › Testing › App links has a test link per service.
- Dragging a sheet (every sheet, `Sheet`): a drag can start anywhere on it, rows and buttons included; a touch that moves 8px mostly downward is a drag, not a tap. A list inside scrolls first and the sheet takes over once the list is at its top, also mid-gesture (lists keep native momentum and their bounce, `overscroll-behavior-y: contain`; only a pull down from a list's top moves the sheet). It closes past a quarter of its height or on a quick flick down (0.5px/ms), continuing down from where it was let go; otherwise it springs back. Dragged up it gives 12px at most. Sideways movement is left alone. Fields are excluded.
- Switching All / Films / Series: cards and section headings that stay glide from where they were (380 ms, measured before and after); new ones fade in (320 ms); ones that leave just go. Done in the page, not as a view transition, which would lift the cards above the tab bar and its blur.
- Card pictures: the artwork of the category's most popular title, a different title per card, looked up once a day. They load like posters, as one piece: picture, colour wash and name stay hidden on the plain card until the picture is decoded, then fade in together (300 ms). Every card picture is fetched 1.5 s after Browse shows, so the View all pages open with them ready. w300 or w780 by screen density.
- Category rows: New in … (this year and last, most popular first; decades get "Popular from the …"), Leaving soon (30 days), Top … series, Top … films (by IMDb rating with enough votes). A row needs three titles to show.
- Grid: type pills with counts on mixed rows, the year alone on typed ones; Sort by Highest rated / Newest / Most popular, re-fetched in that order (90 titles at most). "Only on my services" appears once Your services exists. The big title fades into the bar as the page scrolls.
- The bar on these pages (`TopBar`) dims with the tab bar.
- Lists built from the data we have: Highest rated, Hidden gems (IMDb 7.5+, 2,000–30,000 votes), Under 90 minutes, New this year.
- Not built yet: the Awards section and award rows (need the awards sync); Cult classics, Miniseries, Finished series, Book adaptations, True stories (no data for them); type-specific card pictures; service wordmark cards.

## Search (built 20 Nov, `src/screens/Search.tsx`, `src/lib/search.ts`)

- Boards: Search (v182), Search results with the no-results cases (v121), Search offline (v260).
- The tab bar hides on Search; the close button beside the field goes back to Now.
- Tapping the Search tab opens it with the keyboard coming up and the field rising with it (`src/lib/keyboard.ts`: a stand-in field takes focus during the tap, because the real one is still hidden). Coming back from a title doesn't reopen the keyboard. Opened this way, Search is drawn with the field already above where the keyboard will be and only fades in. When the field is tapped later, it and the prompt lift with a transform at the keyboard's pace (380 ms, the sheet curve); `bottom` is never animated.
- Results scroll under the field. Behind it sits the same blur-and-wash fade as the tab bar, and the field and close button are glass (`--glass` + blur) with the light fill on top so they still read on plain black. The fade rides up with the field when the keyboard opens.
- **The field and the keyboard:** the field is focused by our own code without scrolling (left alone, iOS scrolls the whole app), and rides above the keyboard using the keyboard height measured on this phone (`useKeyboardRoom`), the same measurement the sign-in sheet takes. With no measurement yet, the field and list are held back (invisible) until the keyboard has settled, then rise into place. Dragging the results or pressing Search puts the keyboard away.
- **Words become filters** (`parseQuery`): a service, a decade or year, a genre, a language, "leaving soon". Each shows as a chip that can be removed. "Films" or "series" is not a chip: it selects that type pill, so there is one control for type. A phrase that is a title's whole name ("Modern Family", "American Horror Story") is searched as a name instead. A year alone ("1917") is a name.
- Names are matched by the database's `search_titles` (handles typos, streaming titles first); filters alone list the most popular streaming titles that fit.
- Results show titles not streaming in Sweden too, marked so. "Only on my services" reads "Only what’s streaming" until Your services exists.
- Ideas before typing: Leaving soon, Swedish series, 90s films (each runs that search). The designed ones link to Browse and to award lists, which aren't built.
- Waiting for results: when every word is a filter ("90s films") the chips and the type pill show at once, from the words; pill counts are hidden until the answer is here, then fade in (240 ms). First answer slower than 150 ms: seven skeleton rows in the row shape, breathing together (1.6 s), fading out down the list. Results rise in 25 ms apart. Changing a search keeps the old results at 40% until the new ones arrive. Answers are kept in memory for 5 minutes and the three ideas are fetched ahead, so tapping one shows at once.
- Recents (drawer on the left, in the sheet colour, no edge line; swipe left or tap beside it to close): a search is kept once its results have been on screen for 1.5 s (or the Search key is pressed), replacing the shorter ones typed on the way; plus titles opened from results. 12 at most, kept on the phone and cleared on sign-out.
- Offline: "Search needs a connection for this. We’ll search again when you’re back." and it does. Searching what's saved on the phone needs the service worker, which isn't built.
- Not built yet: People (needs the Person page), award filters and the award line (need the awards sync), the "Results for …" typo line, titles outside the catalogue with Notify me (needs a server-side TMDB lookup), long press on a row.

## Watchlist (built 20 Nov, `src/screens/Watchlist.tsx`)

- List from board v128, empty state (pick wall) from v189.
- **No Your services yet:** `user_services` is empty until that screen is built, so every service counts as yours. The sections then read "Leaving soon", "Streaming now" and "Not streaming in Sweden", and the switch reads "Only what’s streaming". Once services are picked the designed names and the services label appear on their own.
- Leaving soon = leaves within 30 days on one of your services.
- Swipe a row left for Remove (opens past 44px); the bell on a not-streaming row turns Notify on and off.
- Every sheet draws itself in `#root` (the shared `Sheet` does it; screens don't portal sheets) so it covers the tab bar; on the body, iOS scrolled the document when the sheet took focus and it opened at the top. A sheet without a field focuses itself, not its first button.
- Pick wall: 49 posters (7 × 7, so the tilted wall reaches every corner when panned) from the same recent/classic × film/series mix as Now. Adding waits for the saves, then loads the list.
- Not built yet: long press on a row, the "New season" note, the link from the services label to Your services.

## Settings pages: Credits, Privacy, policy and terms

• Credits: two lists in the Settings row style, Data (TMDB · Titles, posters and cast; JustWatch · Where to watch; Streaming Availability · Leaving dates; IMDb · IMDb rating; MDBList · Rotten Tomatoes and Letterboxd scores; Wikidata · Awards) and Design (Inter · Typeface by Rasmus Andersson · SIL Open Font License; Material Symbols · Icons by Google · Apache License 2.0).
• Under them, 12px grey: “This product uses the TMDB API but is not endorsed or certified by TMDB.” (with TMDB’s approved plain white logo, tinted #808080, about 10px tall, from themoviedb.org/about/logos-attribution), “Streaming data by JustWatch.” (required by TMDB), “Information courtesy of IMDb (imdb.com). Used with permission.”, the trademark line, “Reelay 0.1 · Made in Sweden”.
• Settings › Privacy: Privacy policy and Terms of use open as pages inside Reelay (chevron), never Safari. Intro: “…so they follow you to other devices. If someone invited you, they see your email once you join.” / “No ads, no tracking, and your data is never sold.”
• /privacy and /terms are public pages (readable signed out). Back returns to Settings › Privacy, or to Start when opened directly. Text from the “Reelay · Privacy, Terms and Credits” doc (https://claude.ai/artifact/S7MsbsHbJiMiuGMB4LJyE2); the data table becomes a list: item, why, legal basis · how long.

## Home Screen setup

• Manifest: name and short_name “Reelay”, display standalone, start_url / (opens on Now), scope /, id /, background_color and theme_color #000000.
• Icon: the onboarding icon as a 180×180 PNG, solid background (iOS turns transparent parts black). Link it as apple-touch-icon and list it in the manifest. iOS ignores dark and tinted icon variants for web apps.
• Title under the icon: apple-mobile-web-app-title “Reelay”.
• Status bar: apple-mobile-web-app-status-bar-style black-translucent, viewport-fit=cover, safe-area insets for the tab bar.
• Startup images: plain black, one per iPhone screen size (apple-touch-startup-image with media queries), generated in the build. Without them iOS shows a screenshot of the last session, which would clash with the black launch.
• Since iOS 26, adding to the Home Screen opens as a web app by default; the install card’s steps match that.

## Onboarding

• One wall, one camera: every step change is a single transform on the wall. The UI fades out on the same frame the camera starts, so there is no dead beat.
• During a camera move only transform and opacity animate. Dimming is a black overlay per poster; grey flips once, hidden under the dim. On the way back to Services the dimming sweeps bottom to top (≈280 ms), starting 450 ms in.
• Frosted glass needs no fading parent: notification cards stay mounted at 0 opacity and fade their own glass, so the blur is ready when they arrive.
• Layers that only show text (the step UI) pass touches through to the wall; only controls catch them, and only after a transition.
• Leaving onboarding hands off to Now: UI and cards fade, blur lifts as the camera pushes in and the wall fades to black, Now rises with its tab bar already in place.
• Reduce Motion: no camera move or column drift, cross-fades only.

## Desktop

• Any screen wider than a phone (or a non-touch browser) gets this one page, whatever the URL. No app behind it on desktop for now.
• Same poster wall and camera as Start, at the same size, so it reads as the same product. Every column keeps climbing.
• Layout: wordmark small in the top-left corner; centred “Made for your phone” (48px, 600), one line “Invite only. Scan to open Reelay on your phone.” (from an invite link: “You’re invited” / “Scan to join on your phone.”, and the QR carries the invite link), then the QR code to the site on a white squircle. No URL, no footer: nothing else to do here.
• Wall dimmed evenly (black 62%), darker in the centre and at the top and bottom edges.
• The QR code opens the site in Safari on iPhone. Generate it in the build from the site’s own address (usereelay.vercel.app today), never a hard-coded domain.
• Wall fades in 600 ms once posters are ready; headline and code rise 8px, 500 ms, 120 ms after. Reduce Motion: the wall stands still at a fixed angle.

## Title detail variants

• One detail page for every title; the Title tweak switches Series, Film, Not streaming in Sweden and Long text.
• Title: first line always sits at the same height on the art; longer titles wrap down (up to 3 lines, balanced) and push everything under them down. The service pill and save stay level with the first line.
• Film: “Film · year · runtime”, no seasons; Details shows director, writers, runtime and the series it belongs to.
• Sections with nothing to show are left out (no empty Awards).
• Not streaming in Sweden: a white Notify me pill takes the service pill’s place (turns grey, “Notifying”, when on); the services area shows one quiet line instead of rows. Same toasts and iOS permission flow as the Notify me row.
• Cast names and roles get two lines each.
• No wide art: use the poster, cropped from the top, until a backdrop exists.

## Offline and couldn’t load

• Reelay ships a service worker: it saves the app, Now’s rows, every title and person page opened, the watchlist and display-size posters (about the last 300 titles, oldest dropped first). iOS may still clear it; treat it as a cache.
• Offline with saved content: show it, with a small “Offline” pill at the top. Back online: the pill says so, fades, and new content rises in.
• Weak connection: show saved content after ≈1.5 s and keep fetching behind it. Show the pill only after a request actually fails, never on a slow one.
• Nothing saved, a page never opened, or our side failed: one reason and Try again. Failed row: one line and Try again; the rest of the page stays.
• Try again keeps its label and shows a spinner beside it, at least 600 ms; retries back off (1, 2, 4… s) and also run when the connection returns.
• Search offline: searches what’s on the phone, “Offline · some results may be missing”. No matches: “Search needs a connection for this.” The query reruns by itself when back.
• Watchlist, services and notification settings change on the phone offline and sync next time the app is open with a connection (iOS has no background sync). A Notify me turned on offline is only active on the server after that sync. Latest change wins.
• Sign in, sign out and delete need a connection: say so inline where you tap (“You’re offline. Connect to send the code.”, “Connect to sign out”).
• Saved data older than a day hides time-sensitive notes like “Leaves tomorrow”.
• New app versions download in the background and apply on next launch.

## Title not available

• For a link or old notification pointing at a title (or person) Reelay no longer has.
• The Start poster wall behind, black 62%, a soft shadow behind the heading only.
• “This title isn’t available” and a glass Search pill, same as Continue on Start. No subtext. Back and the tab bar stay.
• Not the same as “Not streaming in Sweden”: those titles keep their page with Notify me.
• Removed titles drop off the Watchlist quietly.
• Same page for a person: “This person isn’t available”.

## Notifications on the lock screen

• Title on top, one short line under it, ending in a full stop, the same as the onboarding examples:
  – Leaving soon: “Leaves Netflix tomorrow.”
  – On your services: “Now streaming on HBO Max.”
  – New season: “Season 2 is out on Netflix.”
• Only titles on your Watchlist, and only the kinds switched on in Settings.
• One batch a day at 18:00 Swedish time, so it never wakes anyone. Leaving: the day before it goes.
• Several of the same kind on the same day become one: “3 titles leave tomorrow” with the names under it. It opens Watchlist; a single one opens its title page.
• No app badge: nothing in Reelay needs clearing.
• Tapping opens Reelay with the title page sliding in (see Title from notification).

## Sharing (dropped 20 Nov)

• No Share button and no public title pages. iPhone opens every link in Safari, which can't hand over to the Home Screen app or its sign-in, so people who already use Reelay would land on a dead end. The archived design is on the In progress page under “Archived: sharing a title”. If Reelay becomes a native app, Universal Links make it possible.

## Platform (from modern-web-guidance, checked against Safari on iOS 26)

• Navigation: pages that push in from the right (title, person, Settings sub-pages) use the "stack drill-down" pattern: views side by side in a horizontal scroll-snap stack, so swiping back from the left edge follows the finger like iOS. Behind the page you're leaving, the previous page sits shifted left and dimmed, as on iOS. Back button and browser history stay in step. Safari has no scrollsnapchange: use the guide's IntersectionObserver fallback.
• Sheets (filters, services, Settings drawers): native <dialog> opened with show() plus our own scrim, not showModal(): iOS cuts the top layer off above the bottom of the screen in Home Screen apps. Tap on the scrim and Escape close it. Safari lacks the overlay property: use the guide's data-closing fallback for the closing animation. Swipe-down-to-close is our own gesture on top.
• Long-press menu: popover (top layer, light dismiss), positioned from the poster's rect as in the prototype; no anchor positioning needed.
• Poster rows and the cast row: free native scrolling, no snapping (they stop wherever the flick ends, like Netflix); no JS scrolling.
• View transitions (same-document) for page changes; without support the change is instant.
• Toasts: popover="manual" in one named region (role="region", aria-label="Notifications") plus an ARIA live region (ariaNotify only arrives in Safari 27). No toasts while a sheet is open; hold them until it closes.
• Images: Now's hero poster loading first with fetchpriority="high"; everything below the fold loading="lazy" (never both on one image). Poster rows load all their posters once the row is within one screen of view (IntersectionObserver on the .page scroller), with loading="lazy" as the fallback. A poster arrives in one moment: the grey tile stays plain until the image is loaded and decoded, then the image, its edge line and the service mark fade in together. Image service marks are built in as data URLs. Request TMDB sizes per use (w185 rows, w342 grids, w780/original hero) with srcset.
• Posters and photos load straight from image.tmdb.org (decided 20 Nov). The privacy policy says TMDB sees visitors' IP addresses when images load. Keep image URLs behind one helper (src/lib/images.ts) so routing them through our own site later is a one-line change.
• Long grids and lists: content-visibility: auto with contain-intrinsic-size on off-screen blocks only, never above the fold.
• Reduce Motion per animation (nested @media), never a global animation-duration override.
• Layout (20 Nov): nothing is position: fixed. In the Home Screen app iOS 26 lays the page out 59pt (the status bar) shorter than the screen and cuts fixed layers off there, so html/body are 100lvh (standalone only) and the app and its layers are positioned inside. #root is overflow: clip so iOS can't scroll the app to reveal a field.
• Safari, signed in (src/lib/runway.ts): Safari 26 only draws page content behind the status bar and its address bar while the document is scrolled. The document is 80px + screen + 140px tall and held scrolled by 80px, so the app runs behind both bars; UI stays inside the visible part through --safe-top, --safe-bottom and --edge-b, and the tab bar's blur and wash continue to the bottom. Undocumented Safari behaviour: recheck after Safari updates. Start in Safari keeps the plain layout and fades the wall to black at the top.
• Top buttons (back, settings, offline pill) sit 12px lower than first drawn, clear of the status bar blur in the Home Screen app.
• Pages bounce natively at both ends (overscroll-behavior-y: contain); the tab bar keeps its state during the bounce. Pull to refresh on Now and title pages works like a native iOS list (are.na is the reference): a pull that starts at the top is handled by us, not the browser bounce. The page follows the finger with rubber-band resistance; the wheel (8 thin spokes, grey) sits in the middle of the gap, fills in spoke by spoke and spins once pulled 60 px past the status bar; on release the page eases (420 ms) to rest 48 px below the status bar, waits at least 900 ms, then eases home.
• Icons: weight = 6000 / size, clamped 250–400, so strokes look the same at every size.
• Now mixes films and series, recent and classics, in every row, and shows a title once on the page (hero included); Leaving soon lists everything that leaves.

## Update (v300)

- The app asks the server whether a newer version is out when it opens and when it comes back to the front (at most every 10 minutes).
- Back in the app after an hour or more in the background with a new version out (and online): it reloads into the new version by itself and starts at Now. Shorter breaks keep their place.
- New version out: a 5 px white dot beside the Settings cog on Now (pops in once), and a card at the top of Settings, "A new version is ready" with an Update button (spinner, then the app reloads into the new version; sign-in and saved data stay).
- Settings › About › Version shows the build; tap to check: "Check for update" → spinner → "Up to date" or "Update ready".
- The Testing section keeps only "Show onboarding again", the layout readout and the last failed load.

## Search: Sort and filter drawer (v300 D)

- Behind the plain tune button, with no count or dot on it: what's on already shows as chips right under it (the button's label tells screen readers how many filters are on). What's on shows as chips above the results: the ones read from the words, the drawer's, and a non-default sort.
- One list: Sort by, Only on my services (hidden when no services are picked), then Filter: Genre, Released, Ratings, Length, Original language. Each row shows its value (white) or "Any" (grey). Clear all in the header.
- Ratings has one more level: IMDb (6+, 7+, 8+), Rotten Tomatoes (60%+, 75%+, 90%+, critics) and Letterboxd (3.0+, 3.5+, 4.0+), each a row with its value, each opening its steps. Several can be set; a title must pass all of them, and one without that score doesn't pass. The row reads e.g. "IMDb 7+, RT 75%+"; chips are per source. The drawer is three pages side by side (`data-level`).
- Option counts fade in (240 ms) when known, in place kept for them. No line above the button: the lists run on under it to the bottom of the drawer and blur and fade out beneath it (`.fd-fade`, like pages under the tab bar).
- The Show button: its number rolls digit by digit to the new count (`Rolling`: 480 ms, digits kept by place so only the ones that change move) and keeps the last number while the next is counted. An unseen "Show 000 films" under the label keeps the button at least that wide, and no wider, and a digit place that comes or goes opens or closes over 320 ms so the width eases.
- A row slides in to its options (380 ms, the list behind fades to 40%); Back returns. Genre takes several (any of them); the others take one. Each option shows how many results it gives; one that gives none is dimmed and can't be picked.
- Changes are a draft: "Show n films / series / results" applies them; closing any other way drops them. The button reads "No films match" and is off when the draft gives nothing.
- A filter set in the drawer replaces what the words say about the same thing ("90s films", then Released: 80s).
- Counts: by-name searches count what was found; filter-only searches ask the database, so the number can be larger than the 60 results the list shows.

## Launch order (21 Nov)

- Nothing of the app shows before Now is ready: data in, first hero picture decoded, icon font loaded. Until then the screen is black; after 300 ms the wordmark rises alone (no tab bar, no cog).
- Then: picture, title (160 ms), cog and dots (240 ms), rows (from 300 ms), and last the tab bar (450 ms): its fade eases in over 500 ms and the icons rise.
- An error or the placeholders bring the tab bar and cog at once. Opening on another page (a notification) has no launch: everything is there from the start.
- Ready also means everything above the fold is decoded: the hero picture, its title logo and the first three posters of the first row (2.5 s cap). The wordmark fades out (350 ms, scaling to 1.03) while the page fades in under it.
- Pieces arrive whole: the cog's glass circle fades with its icon and dot; a card's title and meta fade in with its picture.
- One movement (replaces the staged order above): the whole page fades in and settles from scale 1.04 over 900 ms (cubic-bezier(0.22, 1, 0.36, 1)); the wordmark dissolves into it (500 ms, growing to 1.12); the cog fades and the tab bar fades and rises on the same curve, all starting together.
- Revised: fade only, no scaling. The page fades in over 900 ms while the wordmark fades out (500 ms). The tab bar is separate and works as when coming back from Search: its blur is there at once and the icons rise in (380 ms).

- Tab bar dimming: switching tab or opening a page always shows the bar at full strength; a page left while still gliding can't dim it again.

## Top picture: parallax and pull (21 Nov, after Apple TV)

- Scrolling up on Now and title pages: the picture moves at about two thirds of the page's speed (170 px over the first 540 px), so the page slides over it. Off with reduced motion.
- Pulling down: the picture stays at the top of the screen and grows to fill the gap (it scales by cover); the refresh wheel sits over it. On release it eases back with the page (420 ms).
- A page's top bar keeps its own faded or full state: it doesn't change while another page is over it or while it slides away, and coming back restores it (the tab bar follows).

## Search opens and closes as a cross-fade (21 Nov, after Cosmos)

- Opening: the page you were on stays and Search fades in over it (300 ms) while its content rises 36 px with the keyboard (380 ms).
- Closing: Search sinks 36 px with the keyboard and fades out (300 ms) over the page coming back; the tab bar icons rise as usual.

- Long press: nothing behind the menu scrolls while it is open (the finger that opened it is still down), and holding never selects text or shows Copy / Look Up anywhere in the app, except in fields and on the legal pages.
- Search cross-fade revised: 420 ms ease-in-out, content travels 90 px (480 ms). Top-picture parallax moves only `translate` inside a clipping frame, so it stays on the scrolling thread.
- Search cross-fade, Cosmos timings (measured from a recording): open 180 ms, the page darkens first and Search's content fades in 60 ms later (140 ms) rising 100 px (280 ms); close 110 ms, the content fades (80 ms) and sinks first.
- Search follows the keyboard: everything that moves with it uses the keyboard's own timing (500 ms, cubic-bezier(0.38, 0.7, 0.125, 1)). Opening, Search starts a keyboard's height lower and rides it up; closing, the field sinks with it while Search fades. Leaving the app lets go of the field, so coming back shows Search at rest, not floating above a missing keyboard.
- Keyboard timing measured from a recording (replaces the 500 ms guess): up 300 ms cubic-bezier(0.15, 0.85, 0.25, 1); down 180 ms cubic-bezier(0.6, 0.04, 0.7, 0.9).
- Leaving the app on Search drops the field to rest at once (no animation), so the app-switcher picture and the reopening start from Search at rest; animations come back two frames after the app shows again.
- The same holds when iOS bounces the page down after a flick to the top (not only for a pull that starts there): the picture stays at the top and grows. It also reaches 60 px above the screen at all times, so a fast bounce shows more picture, never black.
- Pull to refresh moves the page's content down (not the page's own box, which cut the picture off above its top edge on the phone). The picture keeps its normal framing: no extra reach above the screen.
- Bounce smoothness: the distance is set on the picture's own block (not the page, which restyled everything each frame), and on the way down the picture is sent one frame's movement further than reported, because scroll positions arrive a frame late.

## Top picture, rebuilt (21 Nov): pinned behind the page

- The picture is no longer inside the scrolling page. It sits behind it in a frame pinned to the top of the screen (`PinnedArt`), so when iOS bounces the page down or it is pulled to refresh, the picture doesn't move and nothing is corrected per frame.
- Scrolling up: the frame leaves at the page's speed and the picture inside drifts back 170 px over 540 px (about two thirds of the page's speed). Both follow a 540 px marker at the top of the page as it leaves the screen (a view timeline; since 22 Nov). Measured against the page's whole scroll, Safari ran the picture about 4% fast while a finger scrolled and snapped it back at rest once the page had grown after loading.
- The shade, title and dots stay in the page and move with it. The picture no longer grows on a pull; it stays still and the page slides down over it.
- Keyboard closing on Search: the field sinks over 340 ms with cubic-bezier(0.4, 0, 0.2, 1), a soft start and landing, instead of matching the keyboard's abrupt 180 ms fall.

## Sort and filter drawer in Browse lists and the Watchlist (21 Nov)

- The same drawer as Search, behind each tune button, with what's on as removable chips under the type pills (no count or dot on the button).
- Browse lists: sorts Highest rated / Newest / Most popular (the list's own first); a list that already is a genre, decade or length doesn't offer that filter. Filters apply to the list as loaded (up to 90 titles); changing the sort loads the list again, so its count shows after.
- Watchlist: sorts Recently added / Leaving soonest / Highest rated / A–Z; all filters.
- "Only on my services" is hidden while no services are picked, as in Search.

## Letterboxd (22 Nov, staging)

- **Settings › Letterboxd**: one sentence of intro (it reads the public diary nightly, marks watched films, friends see each other's ratings). Not connected: a field with the placeholder "Letterboxd username" and a small grey Connect pill inside it, with "Films only. Your diary must be public." under it; an unknown member gets an inline error there. Connected: the username with "N films · read HH:MM" and a Profile link, the Mark watched films switch (no subtitle), Import your history, and Disconnect with "Removes your films and ratings from Reelay." Copy is kept to one short line per row.
- **Posters**: a film the person has logged gets a bare white check top left (the service mark stays top right); the picture is not dimmed. The switch (Mark watched films) is off until the member turns it on.
- **Title page, scores**: IMDb · Critics · Audience · Letterboxd, so four fit on one line (Critics and Audience are Rotten Tomatoes).
- **Title page, who watched it** (films only): one 44px row under the scores, with an even 32px of visible space above and below (24px and 22px margins; the row's own air makes up the rest), as part of the top block with up to three initials (yours white, first). "You and 7 friends have watched it" / "You and Anna have watched it" / "3 friends have watched it" / "Anna and Erik have watched it" / "You’ve watched it twice" / "You watched it 12 Mar 2025". Second line: "You 4.0 · Friends 3.7"; with one friend their own rating instead of an average. No row when nobody has.
- **The sheet**: opens from the row when someone else has watched it or you have more than one log. Everyone and Friends averages, your logs (date, stars as a number; "Rewatch"/"First watch" only when there are several), then friends, most recent first ("3 days ago", "12 Mar", "Feb 2024"; "Watched twice · last …"; "no rating"). Open goes to the film on Letterboxd.
- **Hide watched**: a switch in the Sort and filter drawer (Search, Browse lists, Watchlist), only when connected with something logged.
- **Import your history**: a third row on the connected page. It opens a sheet with two steps, each with its own small button on the right: Download (opens letterboxd.com/data/export/, which downloads the ZIP) and Choose file. The white button is the step to do next: Download first, Choose file once Download has been tapped. While it runs the row reads "Importing your history…" with "Reading the file" then "Matching N films"; after, "Imported 22 Nov · N films". A wrong file shows an error on the row. The ZIP is opened on the phone; only the film rows are sent.
- Friends are everyone on Reelay who has connected.

## Home (22 Nov, staging; the first tab, renamed from Now)

A mix of what is happening on the member's services and what is theirs. Everything is limited to their services when they have picked some. A title is shown once (a row skips what a row above has); a row needs three titles; a row that fails to load is left out.

- **Hero**, up to 7 slides, each with a reason line above the meta: "New on Netflix", "On your watchlist" or "Leaves in 3 days", "Trending film this week", "Trending series this week", "Anna rated it 4.5", "Leaves tomorrow".
- **Each liked film is named once on the page**: the Because row uses one film the member rated 4+, the spotlight's "Because you liked" card another (the next day's), and the hero none. With only one such film, the spotlight leaves Because out. With a reason line the logo sits 16px higher. A thin day is filled from trending up to 5.
- **Rows, in order**: New on your services (arrivals of the last 30 days, newest first) · Trending films · Trending series (TMDB's weekly lists; not numbered, they aren't Swedish viewing figures) · Leaving soon · From your watchlist (what can be played, leaving first) · Because you liked X (a different X each day, from films rated 4+) · the spotlight card · Friends liked (films other members rated 4+; the line under the poster is "Anna 4.5") · New films · New series (released this year or last) · Award winners or Hidden gems (alternate days) · two genres (the member's best-rated genres take turns; without ratings every genre does) · one decade (80s to 2010s in turn).
- **Spotlight**: a carousel of up to five 16:10 cards (the next one peeking in, snapping), each with the wide picture, its own reason line, the title, and kind · year · service. One each from Because, Friends, New, the theme row, Leaving soon and Trending, never a hero title; shown when there are two or more. Row title "Picked for you". On each card: the reason (12px, white, medium) directly above the title with no gap, then the meta.
- **Hero reason**: the reason and the meta under it are both 12px (the meta size), the reason white and medium, the meta grey; a reason too long for one line is cut with an ellipsis.
- **Featured titles in the rows**: a title in the hero or the spotlight can also be in a row, but never in its first four places: it moves to just after them, so each row starts with something the page hasn't shown yet.
- **Hide watched films on Home** (Settings › Letterboxd, on by default): leaves logged films out of the recommendation rows (Because, Friends, the theme, genre and decade rows). New, Trending, Leaving soon and the watchlist row show everything.
- Without services, a watchlist or Letterboxd: New this month, both Trending rows, Leaving soon, the spotlight, New films and series, and the rotating rows across every service.

## View all (23 Nov)

- One rule everywhere: a row offers View all only when its whole list has more than the row shows. A row that already holds everything has none.
- Each Home row says where its list opens: New on your services → New on streaming, Trending films/series → Trending (films or series), Leaving soon → Leaving soon, From your watchlist → the Watchlist tab, New films/series → New releases (films or series), Award winners and Hidden gems → their lists, genre and decade rows → their Browse category page. Picked for you, Because you liked and Friends liked have no list of their own (the row is the list).
- The lists behind Home's rows open on Browse's list page (grid, type pills, filter drawer) and cover every service; Home's rows are limited to your services because those come first, not because the rest is hidden.
- Browse category pages: each row asks for one more title than it shows, and offers View all only when that one came back.

## Home from the watchlist (23 Nov)

- **Because you saved X**: like Because you liked, from a title on the watchlist (films and series; a different one each day). TMDB's recommendations of the same kind, on the member's services, not already saved.
- **More with X**: a director, creator or one of the first five billed actors behind three or more titles the member saved or rated 4+; their other titles on the member's services (at least three). View all opens the person when there are more.
- **Now streaming from your watchlist** (saved titles that arrived on a service in the last 30 days) and **Short enough for tonight** (saved films of 40–100 minutes): up to 10 each, shown from 3. A title in one of them isn't repeated in From your watchlist.
- **Spotlight**: up to six cards. After the second liked film come the watchlist's own finds, whether or not their rows are shown: "On your watchlist · now on Netflix" and "On your watchlist · 1 h 28 min".
- **Taste**: genre rows follow the genres the member rates highest; with fewer than three, the genres they save most fill in.
- Order: New · Trending films · Trending series · Leaving soon · Now streaming from your watchlist · From your watchlist · Short enough for tonight · Because you liked · Because you saved · Picked for you · Friends liked · More with · New films · New series · theme · two genres · decade.
- The nightly sync now asks TMDB for recommendations for every saved title as well as every film rated 4+ (`title_recs` keeps films and series apart).


## When Home loads (23 Nov)

- Home is kept on the phone with the sync it was built from. On opening, the app asks only for `data_stamp` (one row, set
  at the end of every sync run). Same sync and same day: the saved Home is shown and nothing else is loaded.
- New sync or a new day: Home is built while the launch screen is up, for up to 1.5 s, so today's Home is the first thing
  seen. Slower than that, or offline: the saved Home is shown and stays put; the new one is put in place the next time
  the Home tab comes to the front, on pull to refresh, or at the next open.
- Saving or removing a title, or a Letterboxd import, builds Home again quietly; it goes in when the member is back on
  the Home tab, never under their eyes. Back to the app after 5 minutes away: checked again, and put in at once only if
  the page hasn't been touched.

## Preloading pages (23 Nov)

- One list of pages (`src/lib/pages.ts`): title, person, a Browse category, a grid (View all), a Browse section. Each
  says what it loads, what that is saved as and which pictures are above the fold; the page itself reads through it.
- Every link to a page preloads it on press (still for 80 ms, or lifted without moving): `PageLink`, `PageButton`,
  `ViewAll` and the poster card. `push` preloads as well, for anything opened another way.
- Now covered too: Home's hero and spotlight, Watchlist rows, Search results, recent searches and people, a title's
  cast, and View all on Browse sections.
- Off production, a page opened by a tap without having been preloaded logs `[pages] … opened without being preloaded`.

## Shared systems (23 Nov)

- **Routes** (`src/lib/routes.ts`): every address is read by `routeOf` and built by `paths`. The app shell picks the
  screen (`renderRoute`), pages.ts what it loads (`pageOf`), and `tabBarShown` whether the tab bar shows.
- **Page frame**: title, person, Browse category, grid and section pages wait, fail ("Couldn't load"), show "isn't
  available" and fade in through `usePageFrame` and `PageContent`.
- **Freshness**: catalogue content (titles, people, lists, covers, search ideas, pictures for walls) is kept until the
  nightly sync has run, not on timers; the stamp is asked on opening and after five minutes away. The member's own
  things (services, watchlist, Letterboxd) are reloaded when they change them (`changed`), and Home rebuilds from
  the same signal.
- **Long press**: one menu for the whole app, opened by any poster or row.
- **Leaving notes**: one function (`leavingFor`) for rows, grids, the hold menu, Watchlist and the title page.

## Pull to refresh (23 Nov)

- On Home, Title, Person, Watchlist, the Browse tab, categories, View all lists and Browse sections. Not on Search,
  Settings and its pages, onboarding, Privacy, Terms or sheets.
- A pull asks whether the nightly sync has run, then reloads what the page shows (Watchlist: the list, its titles and
  your services; Home: a full rebuild). Offline, the page stays as it is and the Offline pill shows.

## Start-up size (23 Nov)

- The app's start-up code went from 208 kB to 151 kB (gzip). Search, Settings, Person, Onboarding, Start, the legal
  pages, Invites, Dev and the desktop page load as their own files (`lazy` in App), asked for as soon as the app has
  started or when first opened.
- The Supabase client is built from `@supabase/auth-js` and `@supabase/postgrest-js` only (`src/lib/supabase.ts`),
  set up as supabase-js sets up its own (same session key, so nobody is signed out). Realtime, Storage and Functions
  aren't used; Edge Functions are called with fetch. The Edge Functions themselves still use supabase-js.

## Wordmark from the first frame (23 Nov)

- The launch wordmark is in index.html (`#boot`, the brand file put in at build time by a small Vite plugin), so it
  rises from the first frame instead of after a black wait while the code loads. Home takes it over as its own
  wordmark phase (timed from when the page started: shown once its rise is done, 1.2 s, and Home is ready), and
  it fades as Home arrives. Signed out, on a computer or opened at another address, it fades at once.

## Pictures kept on the phone (23 Nov)

- The service worker keeps TMDB pictures (posters, backdrops, logos, portraits) after first use, the newest 900
  (`reelay-pictures-v1`), fetched with CORS so they count at their real size. iOS often empties a Home Screen
  app's ordinary cache between opens; with these, a cold start shows its pictures without downloading them again.
- The privacy policy says the app keeps copies of what it shows on the device (updated 23 Nov).

## Likeliest taps (23 Nov)

- 1.5 s after Home has arrived, the title pages of the first hero slide and the first Picked for you card load
  (data and top picture), so they open at once.

## Refresh by tier (23 Nov)

- `public.title_refresh` gives each title a tier. New: released, a new season, or arrived on a service in the last
  30 days. Recent: the same within a year, or watchlisted, trending, or leaving within 30 days. Older: the rest.
- Due by tier (`public.refresh_every`): Rotten Tomatoes and Letterboxd (MDBList) every 2 days / weekly / 90 days;
  the OMDb Tomatometer backup every 3 days / 2 weeks / 90 days while missing; details 7 / 14 / 60 days. IMDb stays
  nightly for everything (one free file). About 840 score lookups and 750 detail refreshes a night (was 2,500).
- `titles.released_on` holds the release or first air day from TMDB.
- "Added" events: a service's first full night (`services.first_synced_on`) isn't arrivals; the 30,000 events of
  20 Nov and the 6,900 of 23 Nov (the five new services) were removed, so New on streaming shows real arrivals.

## Faster reads (23 Nov)

Measured on the database before and after:

| Read | Before | After |
|---|---|---|
| Search | 0.4-2.2 s | 9-110 ms |
| Rated lists (Top, Classics, a genre or country by rating) | 0.3-1.4 s | 6-26 ms |
| Filter counts (genre, years) | 0.4 s | 9 ms |
| Start wall | 0.1-1.1 s | under 1 ms |

- `search_titles` finds its candidates through the trigram index (substring, and word similarity at 0.4 with `<%`).
- `titles.imdb_rating` and `imdb_votes` are copies of the scores (a trigger keeps them in step, writing only on
  change); lists sort and filter on them through `titles_rating`. Use them, not `scores!inner`, to sort or narrow.
- GIN indexes on `titles.genres` and `titles.countries`.
- The Start wall is built each night into `start_wall_posters` (`refresh_start_wall`).
- The sync writes cast and crew by difference (it used to delete and re-add them on every refresh).

## Robustness (23 Nov)

- Saved data on the phone is pruned a few seconds after each start: unused for 30 days goes, newest 400 stay;
  when storage is full the oldest quarter goes and the save is tried again.
- A screen that fails to draw shows "Something went wrong." with Reload instead of a black screen; it and any
  uncaught error are reported to `client_errors` (signed in only, once per message, 10 per session, 30 days).
- Browser tests (`tests/e2e`, `docs/testing.md`) run on every push.
- Accessibility: Picked for you cards are links inside list items; the small top-bar title is hidden from
  assistive tech, as each page has its own heading.

## More like this (24 Nov)

- Each streaming title has its own list of up to 15 alike titles in `title_similar`, built by the nightly sync:
  TMDB's recommendations that stream here first, then `similar_backup` (same director, creator or lead actors;
  shared genres; same original language, more so if not English; era; rating; kids' and animated titles only
  with each other). TMDB is asked again by tier: new every 2 weeks, recent 2 months, older 6 months.
- Until a title's list is built, `similar_titles` scores it live, so every title page has the better row at once.
- On the title page the member's services come first and films they've logged on Letterboxd are left out.

## Swipe back (24 Nov)

- A swipe back decides like iOS: if the finger is moving right when it lets go (or the page is past halfway), the
  page closes, even after a short swipe; turning back left, or holding still short of halfway, keeps it. While it's
  heading out the top page loses its snap point (`data-going`), so Safari already knows where to stop.
- The page is dropped only once the strip is exactly at rest, so the end of the movement can't restart.
- Pull to refresh takes a touch only when it starts clearly downward (1.5 times more down than sideways), so a
  swipe back that begins a little downward stays a swipe.

## Database storage (24 Nov)

- The sync wrote every title's popularity every night for tiny changes, and each write copies the whole row: titles
  was half empty. Popularity is now written only when it moves 15% (and at least half a point).
- `Database compact` (run by hand, waits for the nightly sync) rewrites titles, credits, people, availability and
  scores without the empty space (VACUUM FULL). First run: 170.5 MB → 121.8 MB, each table locked 1–8 seconds.
- Measured and skipped: 4-byte ids (saves under 1%: padding) and reordering columns. Ready if we pass ~350 MB:
  keep directors, creators and the top 3 actors, fetch full cast and person pages from TMDB (about 40 MB).

## Poster meta: year and length (24 Nov)

- The line under a title (posters, search results, watchlist rows, spotlight) is year first, then how long it is:
  `2008 · 2h 6m`, `2013 · 11 seasons`, `2026 · 30m`; `Film`/`Series` only when the length isn't known.
  `metaLine` and `lengthOf` in `catalogue.ts` write it; card queries load `runtime_min` and `seasons`.
- The hero line is where, how long, what kind: `On Netflix · 2h 6m · Action`, `On Netflix · 8 seasons · Crime` (the
  service is left out when the reason above already names it).
- The title page and the hold menu keep the full form ("Film · 2026 · 1 h 52 min"): there's room to read it.

## Hero timer (24 Nov)

- The white bar is the timer: the next slide comes when the bar's fill ends, so the bar can't sit full while the
  slide waits. It runs only while the hero can be seen (app open, its tab showing, no page on top), and each time
  it comes back into view the current slide starts over with a full 5 seconds: nothing switches the moment you look.
  A finger on it holds the bar. With reduced motion there's no bar, and a plain 5-second timer follows the same rules.

## Rows of 7 or more (24 Nov)

- `MIN_ROW = 7`: Home, Browse and More like this leave out a row with fewer titles.
- Home rows fill up: a title another row already shows can come again after the first 4 places (a row needs 4 new
  ones of its own). Because you liked/saved add the source's own More like this list after TMDB's; More with
  <person> counts every credit.
- "Now streaming from your watchlist" and "Short enough for tonight" are folded into From your watchlist: what just
  arrived leads, with "Now on Netflix" under the poster. Runtimes are under every poster now; the spotlight still
  picks a short one ("Only 1h 40m"). Friends liked shows once 7 friends' ratings qualify.

## Awards (24 Nov)

- The awards table was empty: the sync that fills it was never written. `syncAwards` now reads Wikidata (Oscars,
  Primetime Emmys, Golden Globes; technical, honorary and special awards left out): 8,137 wins and nominations,
  592 titles with a win (552 on Lukas's services). Weekly on Sundays; the `Awards` workflow runs it by hand.
- Home has an award row every day, in turn: Oscar winners, Emmy-winning series, Best Picture winners, Golden Globe
  winners. Under each poster: its top category in that award and how many more it won ("Best Picture +3").
  Hidden gems shows every other day. The title page's Awards section now has data too.

## Coming back to Home (24 Nov)

- Coming back to the app on a new day with Home in front: the launch wordmark covers the page at once while
  today's Home is built and its first pictures decoded (up to 2 s), then fades over it, as at a fresh start.
  Not ready in time, the page stays and the new Home waits for the next visit to the tab.
- Other new content (a sync that ran during the day) never swaps in front of you: it is put in place when you come
  back to the Home tab, pull to refresh or open the app.
- A new Home only goes on screen with its first pictures decoded (`prepare` in `useHome`), and once Home has shown
  it never hides again: the black screen before the swap is gone.

## A new version while the app is open (24 Nov)

- After a deploy, a screen the open app loads only when it's opened (Settings, Browse, Title…) is gone under its
  old file name, and opening it crashed ("Something went wrong"; 3 reports on 24 Nov). The app now reloads into the
  new version instead (`reloadForNewVersion` in errors.ts, at most once a minute), and doesn't report it.

## iOS's own back swipe (24 Nov)

- iOS 26 gives Home Screen web apps Safari's edge swipe back whenever there's a history entry to go back to. Our
  pages were history entries (and some were left behind, e.g. after tapping a tab to its start), so on Home the
  swipe slid in a snapshot of Home, and on a page it competed with our own swipe for the same edge.
- In the Home Screen app (`navigator.standalone`) the app now keeps one history entry: every page change replaces
  it, and going back is our swipe and back button only. In a browser, pages stay history entries.

## Update dot on every Settings button (24 Nov)

- `SettingsButton` (src/ui) is the one Settings button: Home and Watchlist use it, and it carries the white update
  dot when a new version is out. The dot springs in when it appears, also while the button is on screen.

## Invite links say Join (24 Nov)

- An invite link showed "Sign in" (greyed) until the server had checked the invite, which can take a few seconds
  the first time (the function starts cold). It now says "Join Reelay" from the first frame and can be tapped at
  once: sending the email redeems the invite, and the server says then if it has expired or been used.
- The invite code is read once as the app starts (`INVITE_TOKEN` in routes.ts), so nothing that changes the address
  later can lose it.

## Logos in the poster corner (24 Nov)

- The corner showed the service's name in text (NETFLIX) for all but SVT Play and SkyShowtime. It now shows the
  services' own logos: small white versions in `src/assets/marks`, inlined (about 9 KB in all), each sized for about
  the same weight (8–12 px tall, at most 34 wide; logos with small lettering a little larger).
- Still text: hayu, Cineasterna and Draken Film (no logo files yet).

## Watched lists over 1,000 films (24 Nov)

- The member's watched films came as a row per film (`letterboxd_watched`), and the API sends at most 1,000 rows:
  Adam has 1,141, so about 140 watched films (The Hobbit among them) weren't hidden. `letterboxd_watched_ids`
  returns the whole list in one row. The saved list has a new name (`lb-watched:v2`) so a cut copy isn't kept, and
  Home is rebuilt (HOME_VERSION 12).
- Anything a member can have more than 1,000 of comes as one row (an array), never a row each.

## Letterboxd matching ignores punctuation (24 Nov)

- Imported films are matched to the catalogue by name and year. Letterboxd and TMDB punctuate titles differently
  ("Mission: Impossible – The Final Reckoning" vs "- The Final Reckoning", "The 40 Year Old Virgin" vs "40 Year-Old"),
  so those stayed unmatched and weren't hidden. `letterboxd_resolve` now compares letters and digits only
  (`letterboxd_key`), year within one, exact match first. Re-run for everyone on 24 Nov: Adam +15, Lukas +11.
- Films still unmatched aren't in the catalogue (not streaming here); the nightly sync matches them when they arrive.

- (24 Nov, later) The logos are sized by visible ink, not by their box: each shows about the same amount of logo
  (`MARK_SHAPE` holds each file's ratio and share of ink), 7–13 px tall, at most 36 wide. Thin logos (Disney+,
  TriArt Play, Prime Video) grew, solid ones (HBO Max, Crunchyroll) calmed down.

## Big films that don't stream, and everything else on TMDB (24 Nov)

- 2001: A Space Odyssey and Chinatown are only to rent in Sweden, so the sync never had them. Well-known titles
  (500+ votes on TMDB: 9,438) are now kept whether or not they stream: 4,254 were added, the rest were already in.
  `syncNotable` adds new ones on Sundays; the clean-up never removes them. Their title page says "Not streaming in
  Sweden" with the notification offer.
- Everything else on TMDB: Search asks the `tmdb` function once its own results are in and lists TMDB's titles the
  catalogue lacks after them (a moment later). Tapping one saves it (title, cast, crew) and opens its page.
  Not asked with a service ("on Netflix"), "my services" or the drawer's filters.
- Awards were read again for the new titles: 13,238 wins and nominations, 883 titles with a win.

## Search: filter lists count and load on (24 Nov)

- A search made by filters alone ("90s thriller", "leaving soon") used to load the 60 most popular titles, and the
  type pills counted those 60 while the filter panel counted the database. Now the pills show the database's totals
  (All, Films, Series) and the list loads 60 more as it nears the end, so every title is reachable.
- Pages follow popularity, then id, so a page never repeats or skips a title. The mixed list (All) shows only as far
  as its own pages reached; Films and Series page on their own.
- The filter panel's "Show N results" button is stacked above the blur under it, so it stays sharp while the panel opens.

## Title page: awards grouped, View all opens a sheet (24 Nov)

- One row per category: the title's own award and the people given it for the title are one row
  ("Nominated · Production Design · Harry Lange +2" on the page; the sheet names everyone).
- The page shows four rows, wins first. When there are more, the Awards heading has View all (as poster rows do),
  which opens a sheet with every award under a heading per ceremony and year, newest first, wins first in each.
  The sheet's heading says "3 wins · 9 in all".

## Explore: lists made of filters, and All titles (24 Nov)

- A Browse list made of filters (a genre, decade or country, Under 90 minutes, Leaving soon, New this year, and the
  rows on a category page such as "Top thriller series") opens with those filters as chips. Taking one off widens the
  list, and the heading follows: "Thriller series" → "Series", "90s" → "All titles".
- The list is read from the database by its filters, 60 at a time as it scrolls, with real totals in the type pills.
- Browse has "All titles" on the right of its heading, in the View all style (design B3): the same page, nothing set.
- Decades can be picked several at once in the filter panel ("90s & 2000s"), in Search too. 70s and 60s are their own
  decades now; Older is before 1960.
- Trending, Hidden gems, Highest rated, Award winners and New on streaming stay fixed lists.

## Not streaming: said once (24 Nov)

- Title page: a title not streaming shows "Not streaming in Sweden" alone (the line under it said the same again);
  after Notify me, "We'll let you know when it's on." under it.
- Watchlist › Not on your services: where a title is ends its meta line, as a service does in the other sections
  ("1968 · 2h 29m · Not streaming", "… · On Viaplay"), instead of a third line.

## Country in the filters (24 Nov)

- The filter panel has a Country row (Sweden, Denmark, Norway, Finland, UK, US, France, Germany, Spain, Italy,
  South Korea, Japan, India, Australia, Canada) in Search and on Explore pages; the chip reads "From Sweden".
  Lists filtered on the phone (the fixed Browse lists, Watchlist) don't offer it: their titles don't carry countries.
- Name searches now also apply decades and country to their results.

## Search: Leaving soon starts on your services (24 Nov)

- The Leaving soon suggestion (before typing) reads "On your services" for a member with services: tapping it
  searches with My services on (a chip that can be taken off), and its poster is the top title on their services.
  The other suggestions turn My services off.

## Title page awards: one line, the sheet for the rest (24 Nov)

- Each row: "Won · Oscars 1969" (or Nominated), then the category and the first name ("Harry Lange +2") on one line,
  cut with … when it doesn't fit.
- When the page hides anything (more than four awards, a "+N", or a line cut on this phone's width), the heading has
  View all and every row opens the sheet at that award. When nothing is hidden, the rows are plain.

## Corner logos: more even; titles never clipped (24 Nov)

- Logos are sized by box area with a light correction for thin ones (area ∝ 1/√ink), instead of equal ink: Prime
  Video and other wide thin logos no longer look big, and dense round ones (Pluto, Crunchyroll) no longer small.
  6.5–11.5 px tall, at most 34 wide. SVT Play and SkyShowtime follow the same rule.
- Services without a logo show their name in 7 px semibold, as written ("Cineasterna"), not 800 capitals.
- Title page: the name has no line limit any more, so nothing is clipped (the 4 px of room is gone).

## Search v3, and Nordic titles in their own language (24 Nov)

- Nordic originals (Swedish, Danish, Norwegian) show their own title ("Fanny och Alexander", "Festen"); Details lists
  the English title. Both are searched, and Letterboxd matching uses the English one too.
- Search also finds the other names a title goes by in Sweden ("Sagan om ringen", "Gudfadern").
- One or two letters search the starts of words with their own index instead of reading every title; a common word
  ("the") no longer looks up services for a thousand titles before keeping 30.
- Order: exact name, streaming, starts with › contains › near miss, then fame (trending plus how well known), so
  The Godfather comes before this year's hits for "god". "&" and "and" are the same.

## Title page picture chosen on purpose (24 Nov)

- The sync picks the title page's picture from every poster and backdrop TMDB has: a textless poster first (the
  page's tall shape, no title text, the art made for the title), else the best voted textless backdrop at least
  1920 wide, loaded at full size so the tall crop stays sharp. Without either, the page shows what it did before.

## Watchlist news under the hero (25 Nov)

- Home's "From your watchlist" row is gone. In its place, one line under the hero when something on the watchlist
  has news: up to three posters fanned, "2 just arrived" (or "Just arrived", "Leaving soon", "3 leaving soon") at
  heading size, and under it the titles and where ("Dune: Part Two on Netflix · The Holdovers leaves Viaplay in
  3 days"), cut with "…". No card, no heading. Arrivals count for 14 days on the member's services; leaving is within
  14 days. One title opens its page; more open the Watchlist. Nothing new: no line.
- The line forgets what you've seen: an arrival goes once you've opened its title (or tapped the line to open the
  Watchlist, which counts as seeing all of them). Something leaving stays until it leaves. A film you've logged on
  Letterboxd goes. Remembered on the phone, so Safari and the Home Screen app each keep their own.

## Days by the phone's clock (25 Nov)

- "Leaves today", "Leaves in 3 days", what counts as new or leaving, and Home's daily rows follow the phone's own
  date. Before, they followed UTC, so just after midnight in Sweden they were a day behind.
