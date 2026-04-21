export const CACHE_TTL_15_MIN_MS = 15 * 60 * 1000

const STORAGE_PREFIX = 'corevital:http-cache:'
const memoryCache = new Map()
const inFlightRequests = new Map()

let storageChecked = false
let storageRef = null

function getStorage() {
  if (storageChecked) return storageRef
  storageChecked = true
  try {
    if (typeof localStorage === 'undefined') return null
    const probe = '__cv_http_cache_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    storageRef = localStorage
  } catch {
    storageRef = null
  }
  return storageRef
}

function cacheKey(namespace, url) {
  return `${STORAGE_PREFIX}${namespace}:${url}`
}

function isFresh(entry, ttlMs) {
  return !!entry && Number.isFinite(entry.ts) && (Date.now() - entry.ts) < ttlMs
}

function removeStoredEntry(key) {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // Ignore storage cleanup failures.
  }
}

function readStoredEntry(key) {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      removeStoredEntry(key)
      return null
    }
    return parsed
  } catch {
    removeStoredEntry(key)
    return null
  }
}

function writeStoredEntry(key, entry) {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(entry))
  } catch {
    // Ignore quota/storage errors and keep in-memory cache only.
  }
}

function readFreshCache(key, ttlMs) {
  const mem = memoryCache.get(key)
  if (isFresh(mem, ttlMs)) return mem.data

  if (mem) memoryCache.delete(key)

  const stored = readStoredEntry(key)
  if (!isFresh(stored, ttlMs)) {
    if (stored) removeStoredEntry(key)
    return undefined
  }

  memoryCache.set(key, stored)
  return stored.data
}

export async function fetchJsonWithCache(url, options = {}) {
  const {
    namespace = 'default',
    ttlMs = CACHE_TTL_15_MIN_MS,
    timeoutMs = 0,
    useCache = true,
  } = options

  const key = cacheKey(namespace, url)

  if (useCache) {
    const cachedData = readFreshCache(key, ttlMs)
    if (cachedData !== undefined) return cachedData

    const pending = inFlightRequests.get(key)
    if (pending) return pending
  }

  const requestPromise = (async () => {
    const ctrl = timeoutMs > 0 ? new AbortController() : null
    const timer = timeoutMs > 0 ? setTimeout(() => ctrl.abort(), timeoutMs) : null
    try {
      const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
      }
      const data = await res.json()
      if (useCache) {
        const entry = { ts: Date.now(), data }
        memoryCache.set(key, entry)
        writeStoredEntry(key, entry)
      }
      return data
    } finally {
      if (timer) clearTimeout(timer)
    }
  })()

  if (!useCache) return requestPromise

  const trackedPromise = requestPromise.finally(() => {
    inFlightRequests.delete(key)
  })
  inFlightRequests.set(key, trackedPromise)
  return trackedPromise
}
