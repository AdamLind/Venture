// src/lib/terms.ts
// Terms of use (#76, #81): accepted after sign-up, and again whenever
// TERMS_VERSION changes. App Review (Guideline 1.2) asks for terms that say
// objectionable content and abusive users aren't tolerated.
//
// DRAFT: plain-language placeholder text. It must be written or reviewed by
// a lawyer before release (how far these hold up varies by state and
// country). Bump TERMS_VERSION when the text changes, so everyone accepts
// the new version.

/** Changing this asks everyone to accept again */
export const TERMS_VERSION = "2026-11-22-draft";

/** Shown as a banner until the lawyer-reviewed text is in */
export const TERMS_IS_DRAFT = true;

/** Where people reach us (Help, the terms, App Store listing). Placeholder
 *  until there's a support address */
export const SUPPORT_EMAIL: string | null = null;

export const TERMS_SECTIONS: {title: string; body: string}[] = [
  {
    title: "Using Venture",
    body: "Venture helps you find and plan dates. By using it you agree to these terms and to our idea guidelines. If you don't agree, please don't use the app.",
  },
  {
    title: "No objectionable content or abuse",
    body: "There's no tolerance for objectionable content or abusive users. Don't post anything sexual, hateful, harassing, illegal or dangerous, and don't use Venture to harm, threaten or spam anyone. Anyone can report an idea or a person; our moderators look at reports within 24 hours, remove content that breaks the rules (including photos, names and usernames), and can suspend accounts that do.",
  },
  {
    title: "What you post",
    body: "You're responsible for the ideas, places and photos you post, and you must have the right to share them. Ideas you publish follow the idea guidelines and are reviewed before they appear. You let Venture show what you publish in the app; you can unpublish or delete it at any time. Private ideas and places stay private.",
  },
  {
    title: "Your safety",
    body: "Ideas are shared by other people. We review them, but we don't verify safety, conditions, prices or hours. Check before you go, use your judgment, and take part at your own risk.",
  },
  {
    title: "Places and businesses",
    body: "Venture isn't connected to the places and businesses in ideas, except ideas marked Sponsored, which come from the business itself.",
  },
  {
    title: "Blocking and reporting",
    body: "You can block a creator to stop seeing their ideas, or forget and block a connection. You can report any idea from its ••• menu, and any person from their connection sheet or a date you're both on. Reports are confidential: nobody is told who reported them.",
  },
  {
    title: "Your privacy",
    body: "How we collect, use and protect your information is in our privacy policy.",
  },
  {
    title: "Your account",
    body: "You can delete your account at any time in Settings. We may suspend or close accounts that break these terms.",
  },
  {
    title: "Limits",
    body: "Venture is provided as is. As far as the law allows, we aren't responsible for what happens on dates or at places you find through the app.",
  },
  {
    title: "Changes",
    body: "If these terms change, we'll ask you to accept the new version before you keep using Venture.",
  },
];
