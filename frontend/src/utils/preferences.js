export function readPreference(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
export function readBoolean(key, fallback) {
  const value = readPreference(key)
  return value === 'true' ? true : value === 'false' ? false : fallback
}
export function writePreference(key, value) {
  try { localStorage.setItem(key, value) } catch { /* Settings still work for this visit. */ }
}
