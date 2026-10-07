const amountFormat = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatNpr(amount: number, style: "plain" | "in" | "out" = "plain") {
  const abs = amountFormat.format(Math.abs(amount));
  if (style === "out") return `−NPR ${abs}`;
  if (style === "in") return `+NPR ${abs}`;
  if (amount < 0) return `−NPR ${abs}`;
  return `NPR ${abs}`;
}

function utcDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

export function formatLongDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(utcDate(iso));
}

export function formatEntryDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(utcDate(iso));
}

export function formatRange(start: string, end: string) {
  const startDate = utcDate(start);
  const endDate = utcDate(end);
  const sameMonth = startDate.getUTCMonth() === endDate.getUTCMonth();
  const startText = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: sameMonth ? undefined : "short",
    timeZone: "UTC",
  }).format(startDate);
  const endText = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(endDate);
  return `${startText} – ${endText}`;
}
