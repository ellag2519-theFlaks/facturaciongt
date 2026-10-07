const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export function isValidIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_REGEX.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function isoToBanguatFormat(isoDate) {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}
