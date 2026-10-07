class MemoryCache {
  constructor() {
    this.store = new Map()
  }

  set(key, value, ttlMs) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  get(key) {
    const entry = this.store.get(key)
    if (!entry) {
      return undefined
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }

    return entry.value
  }
}

export default new MemoryCache()
