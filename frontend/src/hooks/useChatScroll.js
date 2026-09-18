import { useLayoutEffect, useRef } from 'react'

// Only follow an answer while the reader is already at the end. Observe size
// changes too, so wrapping text and opening the keyboard don't hide the reply.
export function useChatScroll(mainRef, contentRef, active, conversationId, hasMessages) {
  const following = useRef(true)
  const scrollToLatest = () => {
    following.current = true
    const main = mainRef.current
    if (main) main.scrollTop = main.scrollHeight
  }

  useLayoutEffect(() => {
    if (!active) return
    const main = mainRef.current
    const content = contentRef.current
    if (!main || !content) return
    // A new chat starts with its welcome, even on a short screen. Existing
    // conversations open at their latest message; sending opts into following.
    following.current = hasMessages
    main.scrollTop = hasMessages ? main.scrollHeight : 0
    const onScroll = () => {
      following.current = main.scrollHeight - main.clientHeight - main.scrollTop < 48
    }
    const observer = new ResizeObserver(() => {
      if (following.current) main.scrollTop = main.scrollHeight
    })
    main.addEventListener('scroll', onScroll, { passive: true })
    observer.observe(content)
    observer.observe(main)
    return () => {
      main.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [active, conversationId, hasMessages, mainRef, contentRef])

  return scrollToLatest
}
