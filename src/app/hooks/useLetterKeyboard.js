import { useEffect, useRef } from 'react'

export function useLetterKeyboard(enabled, onLetter) {
  const handlerRef = useRef(onLetter)

  useEffect(() => {
    handlerRef.current = onLetter
  })

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    function handleKeyDown(event) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) {
        return
      }

      if (event.target instanceof Element && event.target.closest('input, textarea, select')) {
        return
      }

      const letter = event.key.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase()
      if (/^[A-Z]$/.test(letter)) {
        handlerRef.current(letter)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled])
}
