// Saved AI always takes priority, including while connected. An online answer
// is available only when the user has allowed it and local AI is not ready.
export function chooseAssistantSource({ localReady, online, allowOnline }) {
  if (localReady) return 'device'
  if (online && allowOnline) return 'online'
  return null
}
