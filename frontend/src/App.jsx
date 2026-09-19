import Home from './components/Home'
import { SettingsProvider } from './contexts/SettingsContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'

function App() {
  return (
    <SettingsProvider>
      <ChatHistoryProvider>
        <Home />
      </ChatHistoryProvider>
    </SettingsProvider>
  )
}

export default App
