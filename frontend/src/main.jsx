import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startOfflineApp } from './services/offlineAppService'
import './index.css'
import './ui.css'
import App from './App.jsx'

startOfflineApp()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
