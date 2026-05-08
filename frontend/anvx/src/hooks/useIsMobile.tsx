import { useEffect, useState } from 'react'

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth < breakpoint
  )

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      setIsMobile(window.innerWidth < breakpoint)
    })
    observer.observe(document.body)
    return () => observer.disconnect()
  }, [breakpoint])

  return isMobile
}