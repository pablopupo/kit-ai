import { useEffect } from 'react'

// Let CSS handle browser toolbars and normal page scrolling. Adjust only a
// phone's focused chat when the on-screen keyboard covers the layout viewport.
export function useChatViewport(shellRef, active) {
  useEffect(() => {
    const shell = shellRef.current
    const viewport = window.visualViewport
    if (!active || !shell || !viewport) return
    let frame
    const clear = () => {
      shell.removeAttribute('data-keyboard-open')
      shell.style.removeProperty('--keyboard-height')
      shell.style.removeProperty('--keyboard-top')
    }
    const update = () => {
      const focused = document.activeElement?.matches('textarea, input, [contenteditable="true"]')
      const covered = window.innerHeight - viewport.height
      if (focused && covered > 120 && viewport.scale === 1 && window.matchMedia('(max-width: 767px), (pointer: coarse)').matches) {
        shell.dataset.keyboardOpen = 'true'
        shell.style.setProperty('--keyboard-height', `${viewport.height}px`)
        shell.style.setProperty('--keyboard-top', `${viewport.offsetTop}px`)
      } else clear()
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    viewport.addEventListener('resize', schedule)
    viewport.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    document.addEventListener('focusin', schedule)
    document.addEventListener('focusout', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      viewport.removeEventListener('resize', schedule)
      viewport.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('focusin', schedule)
      document.removeEventListener('focusout', schedule)
      clear()
    }
  }, [active, shellRef])
}
