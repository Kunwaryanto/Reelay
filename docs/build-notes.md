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
• Home Screen app: sign-in is a sheet that never moves with the keyboard (a web page can't follow the iOS keyboard smoothly). The first time on a phone it waits invisibly for the keyboard, measures the room it takes, stores it and slides up; after that it opens straight away at that height. The height is constant, keyboard open or closed. Drag down anywhere on it (not on fields or buttons) to close.
• Safari: sign-in is its own page (slides in from the right; back button or Safari's back swipe closes it), field at the top. Safari moves its whole visible area around its bars when the keyboard opens, which a sheet can't hide. The tap on Sign in focuses a stand-in field so the keyboard opens with the page.
• Reelay is a web app. In Safari on iPhone, when it isn't installed yet, the start screen shows the Add to Home Screen card (iOS 26 steps: ••• → Share → Add to Home Screen → Add). Older Safari layouts have Share in the toolbar: show two steps there. “Sign in here” opens sign-in; don't show the card again each visit, remind once when someone turns on a notification (those need the installed app).

• Invite only (v287): without a link the glass button says Sign in, 120px from the bottom; “Reelay is invite only.” sits alone 40px from the bottom (12px, grey). No terms line.
• From a valid invite link: Join Reelay and “You’re invited.”, and the email sheet is titled Join Reelay (otherwise “Continue with email”). It never says who sent it.
• Start in Safari (not yet installed): the Add to Home Screen card for people with an account, quiet “Sign in here”. After joining with an invite: “You’re in. Add Reelay to your Home Screen”, the same steps, “Then open Reelay from your Home Screen and sign in once more.” (Safari and the app don’t share sign-in), quiet “Continue here”.
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
- **Your services** saves each tap to `user_services`. Watchlist, Search and Browse read the same cached list (`my-services:<user>`), and `setQueryData` updates every screen showing it at once.
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
- **Onboarding** (`src/screens/Onboarding.tsx`, v211): three steps, each skippable: services as tiles (others in a More sheet), the pick wall, then the notification switches with three example notifications. Continue on the last step asks iOS for permission if any switch is on. Shown once, when `profiles.onboarded_at` is empty; Settings › Testing shows it again.
- Simpler than the board: service tiles show names, not logos; steps rise in one after another instead of sharing one moving wall; no lock-screen clock and no animated hand-off to Now.

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
- Switching All / Films / Series runs in a view transition: each card and section has a `view-transition-name`, so cards that stay glide to their new places and the ones that come or go fade (380 ms).
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
- The sort sheet is mounted in `#root` (not the body) so it covers the tab bar; in the body, iOS scrolled the document when the sheet took focus. A sheet without a field focuses itself, not its first button.
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
• Poster rows: native scroll snap only; no JS scrolling.
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
- New version out: a 5 px white dot beside the Settings cog on Now (pops in once), and a card at the top of Settings, "A new version is ready" with an Update button (spinner, then the app reloads into the new version; sign-in and saved data stay).
- Settings › About › Version shows the build; tap to check: "Check for update" → spinner → "Up to date" or "Update ready".
- The Testing section keeps only "Show onboarding again", the layout readout and the last failed load.

## Search: Sort and filter drawer (v300 D)

- Behind the plain tune button, with no count or dot on it: what's on already shows as chips right under it (the button's label tells screen readers how many filters are on). What's on shows as chips above the results: the ones read from the words, the drawer's, and a non-default sort.
- One list: Sort by, Only on my services (hidden when no services are picked), then Filter: Genre, Released, IMDb rating, Length, Original language. Each row shows its value (white) or "Any" (grey). Clear all in the header.
- A row slides in to its options (380 ms, the list behind fades to 40%); Back returns. Genre takes several (any of them); the others take one. Each option shows how many results it gives; one that gives none is dimmed and can't be picked.
- Changes are a draft: "Show n films / series / results" applies them; closing any other way drops them. The button reads "No films match" and is off when the draft gives nothing.
- A filter set in the drawer replaces what the words say about the same thing ("90s films", then Released: 80s).
- Counts: by-name searches count what was found; filter-only searches ask the database, so the number can be larger than the 60 results the list shows.
