/**
 * Formats an ISO date string as dd/mm/yyyy, e.g. formatDate("2026-09-30") -> "30/09/2026".
 * Uses UTC getters so date-only ISO strings (no time component) don't shift a day
 * when the browser's local timezone is behind UTC.
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
  const date = new Date(isoString)

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = date.getUTCFullYear()

  return `${day}/${month}/${year}`
}
