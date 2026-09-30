import { useMemo, useState } from 'react'

/**
 * Client-side search + pagination over an already-loaded array.
 * @param {Array<object>} items
 * @param {(item: object) => string} getSearchableText joined text to match the search term against
 * @param {number} pageSize
 */
export function usePaginatedSearch(items, getSearchableText, pageSize = 10) {
  const [searchTerm, setSearchTermRaw] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return items
    return items.filter((item) => getSearchableText(item).toLowerCase().includes(term))
  }, [items, searchTerm, getSearchableText])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)

  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  )

  function setSearchTerm(value) {
    setSearchTermRaw(value)
    setPage(1)
  }

  return {
    searchTerm,
    setSearchTerm,
    page: safePage,
    setPage,
    totalPages,
    pageItems,
    totalCount: filtered.length,
  }
}
