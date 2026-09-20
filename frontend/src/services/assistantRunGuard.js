const stages = new Set(['model-download', 'model-loading', 'generation'])

// A browser process killed during GPU work cannot run catch/finally. A tiny
// journal survives that loss so reopening cannot repeatedly start the same work.
// It contains no questions, device identity, error strings or model content.
export function readAssistantRun(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key))
    return value && ['active', 'interrupted'].includes(value.state) && stages.has(value.stage)
      && typeof value.owner === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value.owner)
      ? { state: value.state, stage: value.stage, owner: value.owner } : null
  } catch { return null }
}

export function beginAssistantRun(key, owner, stage) {
  if (!stages.has(stage)) return false
  try {
    localStorage.setItem(key, JSON.stringify({ state: 'active', stage, owner }))
    return readAssistantRun(key)?.owner === owner
  } catch { return false }
}

export function markAssistantRunInterrupted(key, owner) {
  const current = readAssistantRun(key)
  if (!current || current.owner !== owner) return
  try { localStorage.setItem(key, JSON.stringify({ ...current, state: 'interrupted' })) } catch { /* Best effort. */ }
}

export function finishAssistantRun(key, owner) {
  if (readAssistantRun(key)?.owner !== owner) return
  try { localStorage.removeItem(key) } catch { /* An old marker pauses next startup safely. */ }
}
