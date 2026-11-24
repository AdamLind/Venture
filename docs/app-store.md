# App Store submission

What to enter in App Store Connect for Venture, ready to paste. Fill in the
`TODO` lines once the developer account, domain and demo account exist.
Keep it in step with the app: the privacy answers must match what the app
really collects (`mobile-client/src/lib/privacy.ts`). Launch checklist: #91.

## App information

| Field | Value |
|---|---|
| Name | Venture (fallback if taken: "Venture: Date Planner") |
| Subtitle (30 characters) | Plan dates worth remembering |
| Primary category | Lifestyle |
| Secondary category | Travel |
| Age rating | 18+ (the app requires 18+ at sign-up) |
| Bundle ID | TODO (permanent once chosen) |
| Privacy policy URL | TODO: https://YOUR-DOMAIN/privacy |
| Support URL | TODO: https://YOUR-DOMAIN/support |
| Copyright | TODO: 2026 YOUR NAME or LLC |

## Description (draft)

> Venture helps you plan dates you'll actually remember.
>
> Tell it when you're free, who's coming and what you're in the mood for, and it puts together a plan: the stops, the order, the travel between them, and whether they'll be open when you get there. Swap anything you don't love, then save it.
>
> On the day, Venture keeps the date on track: what's now, what's next, directions, and room to change plans when you're running ahead or something's closed. Take photos as it happens, and every date becomes a memory you can look back on.
>
> - Ideas from people near you, including hidden gems you won't find on a map
> - Plans that fit your time, budget and energy
> - Invite your person or friends to a date, and plan it together
> - Photos taken during the date, kept with it in your Memories
> - Titles you earn from the dates you go on
>
> No ads. No feeds. Just better dates.

**Keywords (100 characters, comma-separated, no spaces needed):**
`date ideas,date night,couples,planner,itinerary,things to do,relationship,anniversary,romantic`

## Notes for App Review (paste into "Notes")

> Venture is a date-planning app for people 18 and older. Sign in with the demo account below.
>
> **Demo account:** TODO email / TODO password
> The account's home area is in Provo, Utah, where our ideas are. On the Plan tab, under Where, choose Go Out and then "Start from: Provo" (the home area), because there are no ideas near Cupertino yet.
>
> **Things to try:**
> - Discover: browse ideas; the ••• menu on an idea has Not interested, Block the creator, and Report.
> - Plan: choose a time and tap to plan; the builder puts stops in order. Save the date.
> - Dates: open the saved date and tap Start early to see the live date screen. The camera button (top right) takes photos during the date; photos can only be taken in the app while a date is live, never from the photo library.
> - Profile: Memories shows past dates as photos; titles under the name are earned from finished dates.
>
> **User-generated content (Guideline 1.2):** ideas are reviewed by a moderator before they appear publicly. Users can report an idea (its ••• menu) or a person (their connection sheet, or a date they're on), block creators, and forget and block connections. Users accept the terms of use, which say objectionable content and abusive users aren't tolerated, at sign-up. Moderators act on reports within 24 hours and can remove content and suspend accounts.
>
> **Account deletion:** Settings › Account › Delete account deletes the account and its data.
>
> **Location:** only while using the app, to plan from where you are and run a live date. Never in the background.

## App Privacy (the "nutrition label")

Tracking: **No**, nothing is used to track people across other companies' apps or websites. No ads, no analytics, no data brokers.

Every type below is **linked to the user** and used for **App Functionality** only.

| Apple's category | Data type | What it is in Venture |
|---|---|---|
| Contact Info | Email Address | Sign-in |
| Contact Info | Name | First and last name (shown to connections and people on your dates) |
| Location | Precise Location | Where a date starts, kept to about 100 m (3 decimal places counts as precise), dropped once the date is over; stop locations |
| User Content | Photos or Videos | Profile photo, idea photos, photos taken during dates |
| User Content | Other User Content | Ideas, places, comments, reports |
| Identifiers | User ID | Account ID, username |
| Other Data | Other Data Types | Birthday (age check), planning preferences (budget, dietary needs), connections and your person, anniversary |

Not collected: health, financial info, contacts, browsing or search history, purchases (none yet), usage data, diagnostics (no crash or analytics tools in the app).

Update this table when push notifications (device tokens) or purchases are added.

## Age rating questionnaire

- Unrestricted web access: No
- User-generated content: Yes (ideas, comments, photos), moderated
- Messaging or chat: comments between people on a shared date (not open chat with strangers)
- Alcohol, tobacco or drug references: Infrequent/mild (some ideas involve drinks; they're marked 21+)
- Everything else (violence, sexual content, gambling, horror, medical): None
- Choose an **18+** rating to match the sign-up rule.

## Screenshots

Needed: 6.9" iPhone (1320 × 2868 or 2868 × 1320), up to 10. iPad isn't supported (supportsTablet is off), so no iPad screenshots. Suggested set: Discover, the plan builder, a saved date, the live date with the map, Memories, Profile with titles.

## Before the first build

- Link the project to Expo: `npx eas init` (adds the project ID to app.json).
- Add the two public app settings as Expo build variables for every environment: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (`npx eas env:create`). Never add `SUPABASE_SECRET_KEY`.
- Set `ios.bundleIdentifier` (and `android.package`) in app.json.
- Replace the placeholder app icon and splash image (`mobile-client/assets/images`).
