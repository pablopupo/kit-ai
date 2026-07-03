import { useState } from 'react'
import { useSettings } from '../contexts/SettingsContext'

function ChatInput({ onSend, disabled, placeholder }) {
  const [message, setMessage] = useState('')
  const { t } = useSettings()

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = message.trim()
    if (trimmed && !disabled) {
      onSend(trimmed)
      setMessage('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 md:p-4 bg-white dark:bg-kit-dark-bg transition-colors duration-300">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 md:gap-3 bg-white dark:bg-kit-dark-bg-light rounded-full px-3 md:px-4 py-1.5 md:py-2 shadow-sm border border-gray-200 dark:border-kit-dark-bg-lighter transition-colors duration-300">
          {/* Input field */}
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={placeholder || t('inputPlaceholder')}
            disabled={disabled}
            className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-gray-700 dark:text-kit-dark-text placeholder-gray-400 dark:placeholder-kit-dark-text-muted font-medium py-2 text-base transition-colors duration-300"
          />

          {/* Send button - min 44px touch target */}
          <button
            type="submit"
            disabled={disabled || !message.trim()}
            className="shrink-0 w-11 h-11 md:w-10 md:h-10 flex items-center justify-center bg-kit-teal-hover dark:bg-kit-teal-dark text-white rounded-full hover:bg-[#2E8E82] dark:hover:bg-kit-teal disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-sm hover:shadow"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </form>
  )
}

export default ChatInput
