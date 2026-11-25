// src/lib/links.ts
// An idea's link: what to open, and how to show it.

/** What to open: "example.com/menu" works too (https:// is added) */
export const linkHref = (url: string) => {
  const u = url.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
};

/** How it reads under the title: no https://, www. or trailing slash */
export const linkText = (url: string) =>
  url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");

/** The longest link title (activities_url_label_check) */
export const LINK_LABEL_MAX = 60;
