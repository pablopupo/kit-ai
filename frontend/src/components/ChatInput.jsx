import { useState, useRef, useLayoutEffect } from 'react'
import { useSettings } from '../contexts/SettingsContext'

function ChatInput({ onSend, disabled, placeholder }) {
  const [message, setMessage] = useState('')
  const inputRef = useRef(null)
  const { t } = useSettings()

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`
  }, [message])

  const send = () => {
    const trimmed = message.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setMessage('')
  }

  const handleKeyDown = event => {
    // A phone's Return key remains useful for adding symptom details on new lines.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !window.matchMedia('(pointer: coarse)').matches) {
      event.preventDefault()
      send()
    }
  }

  return (
    <form onSubmit={event => { event.preventDefault(); send() }} className="px-3 py-2 md:px-6 md:py-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-2 md:gap-3 bg-white dark:bg-kit-dark-bg-light rounded-3xl px-3 md:px-4 py-1.5 md:py-2 shadow-sm border border-[#CFE5E0] dark:border-kit-dark-bg-lighter transition-colors duration-150 focus-within:ring-2 focus-within:ring-kit-teal">
          <label htmlFor="chat-message" className="sr-only">{t('inputPlaceholder')}</label>
          <textarea
            id="chat-message"
            ref={inputRef}
            rows={1}
            value={message}
            onChange={event => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || t('inputPlaceholder')}
            disabled={disabled}
            autoComplete="off"
            maxLength={1200}
            aria-describedby={message.length >= 1000 ? 'message-length' : undefined}
            className="flex-1 min-w-0 max-h-28 resize-none bg-transparent border-none focus:outline-none text-gray-700 dark:text-kit-dark-text placeholder-gray-400 dark:placeholder-kit-dark-text-muted font-medium py-2.5 text-base leading-6 transition-colors duration-150"
          />
          <button
            type="submit"
            aria-label={t('sendMessage')}
            disabled={disabled || !message.trim()}
            className="shrink-0 w-11 h-11 flex items-center justify-center bg-[#17695F] dark:bg-kit-teal-dark text-white rounded-full hover:bg-[#2E8E82] dark:hover:bg-kit-teal disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        {message.length >= 1000 && <p id="message-length" className="px-3 pt-1 text-right text-xs text-gray-500 dark:text-kit-dark-text-muted">{t('characterCount', { count: message.length })}</p>}
      </div>
    </form>
  )
}

export default ChatInput
