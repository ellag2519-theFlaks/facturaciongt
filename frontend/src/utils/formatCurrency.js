/**
 * Formats a numeric amount as Guatemalan Quetzales, e.g. formatCurrency(150) -> "Q 150.00".
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  return `Q ${Number(amount).toFixed(2)}`
}
