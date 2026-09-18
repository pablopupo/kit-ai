import { useSyncExternalStore } from 'react'
import { subscribeOfflineApp, getOfflineAppSnapshot } from '../services/offlineAppService'

export function useOfflineApp() {
  return useSyncExternalStore(subscribeOfflineApp, getOfflineAppSnapshot, getOfflineAppSnapshot)
}
