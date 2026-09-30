/**
 * Formats an ISO date string as dd/mm/yyyy, e.g. formatDate("2026-09-30") -> "30/09/2026".
 * Uses UTC getters so date-only ISO strings (no time component) don't shift a day
 * when the browser's local timezone is behind UTC.
 *
 * Also handles SQLite's `datetime('now')` format, e.g. "2026-09-30 21:05:59"
 * (space separator, no timezone marker). Without normalization, `new Date(...)`
 * parses that string as LOCAL time instead of UTC, so on a UTC-negative
 * machine a timestamp from the evening UTC rolls to the next calendar day
 * once read back with UTC getters. Replacing the space with "T" and appending
 * "Z" makes JS parse it as the UTC instant it actually represents.
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
  const normalized = isoString.includes('T') || isoString.endsWith('Z')
    ? isoString
    : `${isoString.replace(' ', 'T')}Z`
  const date = new Date(normalized)

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = date.getUTCFullYear()

  return `${day}/${month}/${year}`
}
