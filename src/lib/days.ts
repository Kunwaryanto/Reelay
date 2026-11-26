// Days as the phone counts them. Dates from the server ("leaves_on", "happened_on") are plain days with no time, so
// "today" and "in 3 days" are the phone's own calendar days, not UTC's: after midnight here it is the new day here.

const pad = (n: number) => String(n).padStart(2, '0')
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The phone's date, `n` days from today: "2026-11-25". */
export function localDay(n = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + n)   // by calendar day, so a clock change doesn't skip or repeat one
  return dayOf(d)
}

/** How many of the phone's days from today to a plain date ("2026-11-28" → 3); negative when it has passed. */
export function daysUntil(day: string): number {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  const now = new Date()
  return Math.round((new Date(y, m - 1, d).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 864e5)
}

/** A number that goes up by one at the phone's midnight, for what changes from day to day. */
export function dayNumber(): number {
  const now = new Date()
  return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5)
}
