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

• Hold 0.45 s; moving more than 8px first counts as scrolling. The poster lifts into a larger preview, the screen and tab bar blur, a glass menu grows from under it. Tap outside: it settles back.
• Menu = the actions from the title page, never new ones. Title as a small header, then:
  – Default: Add to / Remove from Watchlist, Open in [service], Share.
  – Watchlist: Remove from Watchlist (red) first, Notify me, Open in [service], Share.
  – Not streaming in Sweden: Notify me instead of Open in.
• On every poster and title card: Now rows, Browse, categories, Search, Watchlist, Person, More like this. Not on the Now hero (swipe), cast, pills or settings rows.
• Turn off Safari’s link menu on posters (-webkit-touch-callout: none, no selection). No haptics on the web. Reduce Motion: fade only.

## Start and sign in

• Wrong code and a rejected email shake (no haptics on the web). Never on expired, too many tries or a failed send.
• Poster wall: the camera mostly sways sideways; every column keeps climbing (at least 48 px/s, bob capped at 12 px/s), so no row lingers on the same posters. Same wall on Start, sign-in states and the install card.
• Reduce Motion: no shake, no letter rise, wall stands still; red outlines and messages stay.
• Code length, expiry and attempt limits come from Supabase Auth. The resend countdown is 60 s.
• Email field: autocomplete="email"; code field: autocomplete="one-time-code" for the From Mail suggestion.
• Reelay is a web app. In Safari on iPhone, when it isn't installed yet, the start screen shows the Add to Home Screen card (iOS 26 steps: ••• → Share → Add to Home Screen → Add). Older Safari layouts have Share in the toolbar: show two steps there. Continue in Safari opens sign-in; don't show the card again each visit, remind once when someone turns on a notification (those need the installed app).

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

• Any screen wider than a phone (or a non-touch browser) gets this one page, whatever the URL, including shared title links. No app behind it on desktop for now.
• Same poster wall and camera as Start, at the same size, so it reads as the same product. Every column keeps climbing.
• Layout: wordmark small in the top-left corner; centred “Made for iPhone” (48px, 600), one line “Scan with your camera to open Reelay.”, then the QR code to reelay.se on a white squircle. No URL, no footer: nothing else to do here.
• Wall dimmed evenly (black 62%), darker in the centre and at the top and bottom edges.
• The QR code opens reelay.se in Safari on iPhone, where the Add to Home Screen card takes over.
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

## Shared link in Safari

• Share sits top right on the title page, mirroring Back. It opens the iOS share sheet with the title and its link (reelay.se/the-sinner). The link preview uses the title’s art and name.
• iPhone always opens shared links in Safari, even with Reelay installed: web apps can’t catch links, and Safari doesn’t share storage with the app.
• So the link opens a public title page in Safari that works on its own: where it streams in Sweden, scores, description, cast. No sign-in, no save, no Notify me, no tab bar.
• A small card above Safari’s bar: Reelay, one line, Get. Get opens the Add to Home Screen steps; under them, “Already have Reelay? Open it and search for The Sinner.”
• Only title pages are public; the rest of Reelay still needs an account.
• On a computer, the link shows the Made for iPhone page.
• The share sheet is iOS’s own: navigator.share with the title and URL. Each title page sets og:title and og:image so the preview shows its art.
