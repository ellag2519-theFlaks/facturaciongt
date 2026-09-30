/**
 * Formats an ISO date string as dd/mm/yyyy, e.g. formatDate("2026-09-30") -> "30/09/2026".
 *
 * Date-only strings (no time component, e.g. "2026-09-30") are read with UTC
 * getters, since there's no time-of-day to be ambiguous about and this avoids
 * a day shift when the browser's local timezone is behind UTC.
 *
 * Datetime strings — including SQLite's `datetime('now')` format, e.g.
 * "2026-09-30 21:05:59" (space separator, no timezone marker) — are first
 * normalized to a UTC-marked ISO string (replacing the space with "T" and
 * appending "Z", so JS parses them as the UTC instant they actually
 * represent instead of as local time), then read back with LOCAL getters so
 * the displayed date matches the viewer's actual local calendar day for that
 * UTC instant (e.g. an evening UTC timestamp correctly shows as "today" for
 * a viewer in a UTC-negative timezone, instead of rolling to tomorrow).
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(isoString)
  const normalized = isDateOnly || isoString.includes('T') || isoString.endsWith('Z')
    ? isoString
    : `${isoString.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  const day = isDateOnly ? date.getUTCDate() : date.getDate()
  const month = (isDateOnly ? date.getUTCMonth() : date.getMonth()) + 1
  const year = isDateOnly ? date.getUTCFullYear() : date.getFullYear()
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}
