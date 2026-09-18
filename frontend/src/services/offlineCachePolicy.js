export const OFFLINE_PROTOCOL = 'kit-offline-v1'
export const isAssistantAsset = url => /(?:^|\/)assets\/webllm(?:Service|-worker)-[^/]+\.js$/.test(url)

export function splitOfflineAssets(manifest) {
  return {
    app: manifest.filter(entry => !isAssistantAsset(entry.url)),
    assistant: manifest.filter(entry => isAssistantAsset(entry.url)),
  }
}

export async function allAssetsSaved(entries, match) {
  if (!entries.length) return false
  const results = await Promise.all(entries.map(async entry => {
    try { return (await match(entry.url))?.status === 200 } catch { return false }
  }))
  return results.every(Boolean)
}

export function savedAppStatus(report, controlled) {
  return controlled && report?.protocol === OFFLINE_PROTOCOL && report.appSaved === true ? 'ready' : 'error'
}
