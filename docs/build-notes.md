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
• Reduce Motion: no shake, no letter rise, wall stands still; red outlines and messages stay.
• Code only: the email carries the 6-digit code and no link (a link would sign in Safari, not the installed app). Code length, expiry and attempt limits come from Supabase Auth. The resend countdown is 60 s.
• Email field: autocomplete="email"; code field: autocomplete="one-time-code" for the From Mail suggestion.
• Reelay is a web app. In Safari on iPhone, when it isn't installed yet, the start screen shows the Add to Home Screen card (iOS 26 steps: ••• → Share → Add to Home Screen → Add). Older Safari layouts have Share in the toolbar: show two steps there. Continue in Safari opens sign-in; don't show the card again each visit, remind once when someone turns on a notification (those need the installed app).

• Invite only (v287): without a link the glass button says Sign in, 120px from the bottom; “Reelay is invite only.” sits alone 40px from the bottom (12px, grey). No terms line.
• From a valid invite link: Join Reelay and “You’re invited.” It never says who sent it.
• An email without an account gets “Reelay is invite only” in the sheet instead of a code, with Use another email. An expired or used link opens the sheet with the reason and “I already have an account”.
• No privacy or terms line on Start or in the sheet while Reelay is invite only among friends; the privacy policy and terms live in Settings › Privacy. If Reelay opens up, bring the line back (archived Start v18).

## Invite friends (admins only)

• Settings › Invite friends sits under Your services, only when profiles.is_admin. The row shows “n waiting”.
• The page: one line on how links work, then “+ New invite link”, the 32px grey pill. It calls create_invite() and opens navigator.share with “You’re invited to Reelay” and https://usereelay.vercel.app/i/<token>.
• Sent list from the invites table: Waiting (joined_at null and not expired; “works until <date>”; Cancel calls cancel_invite, Undo calls restore_invite with the removed row), Joined (used_email, “Joined <date>”), Expired. The nightly sync removes joined and expired ones after 30 days.
• /i/<token> opens Start. Ask redeem-invite with { token }: valid → Join Reelay; expired or used → the sheet with the reason. On Send code ask it with { token, email }: created or existing → signInWithOtp({ shouldCreateUser: false }) and the usual code. Without a link, signInWithOtp with shouldCreateUser false; a “signups not allowed” error means no account → the “Reelay is invite only” sheet.
• An invite is spent only at the account’s first sign-in (joined_at), so a mistyped email doesn’t burn the link.

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
• Sheets (filters, services, Settings drawers): native <dialog> with showModal(). Safari lacks closedby="any": add the guide's tap-outside fallback. Safari lacks the overlay property: use the guide's data-closing fallback for the closing animation. Swipe-down-to-close is our own gesture on top.
• Long-press menu: popover (top layer, light dismiss), positioned from the poster's rect as in the prototype; no anchor positioning needed.
• Poster rows: native scroll snap only; no JS scrolling.
• View transitions (same-document) for page changes; without support the change is instant.
• Toasts: popover="manual" in one named region (role="region", aria-label="Notifications") plus an ARIA live region (ariaNotify only arrives in Safari 27). No toasts while a sheet is open; hold them until it closes.
• Images: Now's hero poster loading first with fetchpriority="high"; everything below the fold loading="lazy" (never both on one image). Request TMDB sizes per use (w185 rows, w342 grids, w780/original hero) with srcset.
• Posters and photos load straight from image.tmdb.org (decided 20 Nov). The privacy policy says TMDB sees visitors' IP addresses when images load. Keep image URLs behind one helper (src/lib/images.ts) so routing them through our own site later is a one-line change.
• Long grids and lists: content-visibility: auto with contain-intrinsic-size on off-screen blocks only, never above the fold.
• Reduce Motion per animation (nested @media), never a global animation-duration override.
