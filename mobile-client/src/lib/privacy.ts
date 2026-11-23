// src/lib/privacy.ts
// The privacy policy (#76), from Settings › Help and the terms. App Review
// needs one in the app and at a public link (App Store Connect › App
// Privacy), and the two must match. It has to match what the app really
// does too: change it when the data changes (new fields, a new service).
//
// DRAFT: plain-language text written from what the app stores today. It
// must be reviewed by a lawyer before release (GDPR, CCPA and other laws may
// need more: a legal entity name, a postal address, the legal basis for each
// use, how long things are kept).

/** When this version was written */
export const PRIVACY_UPDATED = "November 22, 2026";

/** Shown as a banner until the lawyer-reviewed text is in */
export const PRIVACY_IS_DRAFT = true;

export const PRIVACY_SECTIONS: {title: string; body: string}[] = [
  {
    title: "The short version",
    body: "Venture collects what it needs to plan dates with you and the people you choose, and nothing else. We don't sell your information, show you targeted ads, track you across other apps or websites, or use it to train AI.",
  },
  {
    title: "Your account and profile",
    body: "Your email address and password let you sign in (passwords are stored encrypted; we can't see them). Your username and photo can be seen by other people in Venture. Your first and last name are only shown to you, your connections, and people on a date with you. Your birthday is used to check you're old enough and to show ideas that suit your age; nobody else sees it unless you choose to share it with your person.",
  },
  {
    title: "Where you are",
    body: "If you allow it, Venture uses your location while you're using the app: to plan a date from where you are, find places near you, and keep a date on track while it's happening. It never uses your location in the background. You can also save a home area to plan from instead. Where a date starts is saved with it while it's coming up or happening (for travel times), and removed once it's over.",
  },
  {
    title: "Your dates",
    body: "Dates you plan (their stops, times, notes and budget), the comments on them, and photos you add during a date are saved to your account. Everyone you invite to a date can see it, along with the others on it.",
  },
  {
    title: "Ideas and places you share",
    body: "Ideas and places you publish are public once a moderator approves them, with your username. Private ideas and places are only seen by you, and by the people on a date you add them to. Moderators never see private ideas or places.",
  },
  {
    title: "Connections and your person",
    body: "We keep who you're connected to, the requests you send and receive, who your person is, and dates that matter to you both (like an anniversary). We also keep the people you've forgotten or blocked and the ideas you've saved or hidden, so the app can respect them.",
  },
  {
    title: "Reports and safety",
    body: "When you report an idea or a person, we keep the report so a moderator can look into it. The person you report isn't told who reported them. If someone reports you, a moderator can see your username, name and photo, and what was reported, and can remove a photo or name that breaks the rules. We keep a record of every moderation decision and which version of the terms you accepted.",
  },
  {
    title: "Services we use",
    body: "Supabase stores Venture's data and photos and handles sign-in. Open-Meteo gets the location and time of a date's stops (never who you are) to forecast the weather. Some stock photos load from Unsplash, which sees an ordinary web request. Maps are drawn by Apple Maps on iPhone and Google Maps on Android. These services only use what they get to provide that service.",
  },
  {
    title: "Who can see what",
    body: "Other people only see what's described above. Venture's staff can see information when they need to, for example to review a published idea, look into a report, or help you when you contact us. We'll share information if the law requires it, or to protect someone's safety.",
  },
  {
    title: "Deleting your information",
    body: "You can change your profile any time in Settings. Deleting your account (Settings › Account) permanently removes your profile, photo, birthday, planning defaults, home area, the dates you planned (with their photos), saved ideas and unpublished ideas. Ideas you published stay in Discover with your name removed.",
  },
  {
    title: "Children",
    body: "Venture is for people 16 and older. If you believe someone younger has an account, report them or contact us and we'll remove it.",
  },
  {
    title: "Keeping it safe",
    body: "Everything travels over an encrypted connection, and the database only lets each person read what they're allowed to see. No system is perfectly secure, but we work to keep your information protected.",
  },
  {
    title: "Changes",
    body: "If this policy changes in a way that matters, we'll tell you in the app before it takes effect.",
  },
];
