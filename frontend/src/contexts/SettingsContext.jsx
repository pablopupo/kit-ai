import { createContext, useContext, useState, useEffect } from 'react'
import { readPreference, readBoolean, writePreference } from '../utils/preferences'
import { translations } from '../utils/translations'

const SettingsContext = createContext()

export function SettingsProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    return readBoolean('kit-ai-dark-mode', false)
  })

  const [language, setLanguage] = useState(() => {
    const saved = readPreference('kit-ai-language')
    return saved || 'en'
  })

  // Persist dark mode to localStorage
  useEffect(() => {
    writePreference('kit-ai-dark-mode', JSON.stringify(darkMode))

    // Apply dark mode class to document
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  // Persist language to localStorage
  useEffect(() => {
    writePreference('kit-ai-language', language)
  }, [language])

  const t = (key) => {
    return translations[language]?.[key] || translations['en'][key] || key
  }

  const value = {
    darkMode,
    setDarkMode,
    language,
    setLanguage,
    t,
  }

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}
