// The pinned SDK resets its number between transfer, cache loading and shader
// preparation. These numbers must never be presented as one download percent.
export function engineProgress(report = {}) {
  const text = typeof report.text === 'string' ? report.text : ''
  const transfer = text.startsWith('Fetching param cache[')
  const opening = /^(Loading model from cache\[|Loading GPU shader modules\[|Finish loading on )/.test(text)
  const fraction = report.progress
  const measured = typeof fraction === 'number' && Number.isFinite(fraction) && fraction > 0 && fraction < 1
  return {
    preparationStage: opening || (transfer && fraction >= 1) ? 'opening' : transfer ? 'downloading' : 'preparing',
    progress: transfer && measured ? fraction * 100 : null,
  }
}
