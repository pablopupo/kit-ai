import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { readPreference, readBoolean, writePreference } from '../utils/preferences'
import { translations } from '../utils/translations'
import { appCopy } from '../utils/appCopy'

const SettingsContext = createContext()

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
]
const languageCodes = new Set(SUPPORTED_LANGUAGES.map(({ code }) => code))

function initialLanguage() {
  const saved = readPreference('kit-ai-language')
  if (languageCodes.has(saved)) return saved
  const browserLanguages = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language])
  return browserLanguages.map(locale => String(locale).toLowerCase().split('-')[0]).find(code => languageCodes.has(code)) || 'en'
}

export function SettingsProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    return readBoolean('kit-ai-dark-mode', false)
  })

  const [language, setLanguageState] = useState(initialLanguage)
  const [autoPrepare, setAutoPrepare] = useState(() => readBoolean('kit-ai-auto-prepare', true))
  const [allowOnline, setAllowOnline] = useState(() => readBoolean('kit-ai-allow-online', true))

  const setLanguage = useCallback(nextLanguage => {
    setLanguageState(current => {
      const next = typeof nextLanguage === 'function' ? nextLanguage(current) : nextLanguage
      return languageCodes.has(next) ? next : current
    })
  }, [])

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
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    writePreference('kit-ai-auto-prepare', String(autoPrepare))
  }, [autoPrepare])

  useEffect(() => {
    writePreference('kit-ai-allow-online', String(allowOnline))
  }, [allowOnline])

  const t = useCallback((key, variables = {}) => {
    const text = appCopy[language]?.[key] ?? appCopy.en[key] ?? translations[language]?.[key] ?? translations.en[key] ?? key
    return String(text).replace(/\{(\w+)\}/g, (match, name) => variables && Object.hasOwn(variables, name) ? String(variables[name]) : match)
  }, [language])

  const value = useMemo(() => ({
    darkMode,
    setDarkMode,
    language,
    setLanguage,
    autoPrepare,
    setAutoPrepare,
    allowOnline,
    setAllowOnline,
    t,
  }), [darkMode, language, setLanguage, autoPrepare, allowOnline, t])

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
