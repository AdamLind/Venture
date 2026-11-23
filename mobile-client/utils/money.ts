// utils/money.ts
// Money as people read it. Prices are decimals, and adding or multiplying
// them drifts (34.99 × 2 = 69.97999...), so everything is rounded to the
// cent first. Whole dollars show without cents ("$35"), anything else with
// two ("$34.99", "$35.50"), never one; thousands get commas ("$1,200").
//
// Built by hand (toFixed + commas): the app's JS engine doesn't always honour
// toLocaleString's decimal options, which turned $35.50 into "$35.5".

/** Dollars, rounded to the cent */
export const toCents = (amount: number | string | null | undefined) => Math.round((Number(amount) || 0) * 100) / 100;

/** "$35", "$34.99", "$35.50", "$1,200" */
export function formatMoney(amount: number | string | null | undefined): string {
  const dollars = toCents(amount);
  const negative = dollars < 0;
  const [whole, cents] = Math.abs(dollars).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}${cents === "00" ? "" : `.${cents}`}`;
}
