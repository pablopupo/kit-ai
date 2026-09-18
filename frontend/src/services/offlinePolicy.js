export function shouldDeferDownload(connection, previouslyPrepared = false) {
  return !previouslyPrepared && Boolean(connection?.saveData || connection?.type === 'cellular')
}

export function chooseAnswerSource({ localReady, online, allowOnline }) {
  if (online && allowOnline) return 'online'
  if (localReady) return 'device'
  return 'guides'
}
