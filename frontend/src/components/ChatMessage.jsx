import { memo } from 'react'
import AudioPlayer from './AudioPlayer'

function ChatMessage({ role, content, showAudio = false }) {
  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-5`}>
      <div className={`flex min-w-0 items-end gap-2 md:gap-3 max-w-[96%] md:max-w-[90%] ${isUser ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        <div className={`shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${
          isUser ? 'bg-kit-teal-light dark:bg-kit-teal-dark/30' : 'bg-kit-red dark:bg-kit-red'
        }`}>
          {isUser ? (
            <svg className="w-5 h-5 text-teal-800 dark:text-teal-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          ) : (
            <div className="w-5 h-5 relative">
              <div className="absolute top-1/2 left-0 w-full h-1 bg-white -translate-y-1/2 rounded-full"></div>
              <div className="absolute left-1/2 top-0 w-1 h-full bg-white -translate-x-1/2 rounded-full"></div>
            </div>
          )}
        </div>

        {/* Message Bubble */}
        <div className={`min-w-0 px-4 py-3 md:px-5 md:py-4 ${
          isUser
            ? 'bg-kit-teal-light dark:bg-kit-teal-dark/20 text-slate-800 dark:text-kit-dark-text rounded-3xl rounded-br-lg'
            : 'bg-[#FFF5F3] dark:bg-kit-dark-bg-light text-slate-800 dark:text-kit-dark-text rounded-3xl rounded-bl-lg border border-[#F9E6E2] dark:border-kit-dark-bg-lighter'
        }`}>
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{content}</p>

          {/* Audio Player - only for assistant messages */}
          {!isUser && showAudio && (
            <AudioPlayer
              messageContent={content}
              messageId={`msg-${content.substring(0, 40)}`}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(ChatMessage)
