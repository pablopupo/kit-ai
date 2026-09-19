import Home from './components/Home'
import { SettingsProvider } from './contexts/SettingsContext'
import { TTSProvider } from './contexts/TTSContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'
import { lazy, Suspense } from 'react'
import { isMedicalTrial } from './services/medicalTrialConfig'

const MedicalModelTrial = lazy(() => import('./components/MedicalModelTrial'))

function App() {
  return (
    <SettingsProvider>
      {isMedicalTrial(window.location.search) ? <Suspense fallback={<p className="p-6">Kit…</p>}><MedicalModelTrial /></Suspense> :
      <TTSProvider>
        <ChatHistoryProvider>
          <Home />
        </ChatHistoryProvider>
      </TTSProvider>
      }
    </SettingsProvider>
  )
}

export default App
