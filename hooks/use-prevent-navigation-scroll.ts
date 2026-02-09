// Prevent horizontal scroll for Back page usage in Mac
"use client"

import { useEffect } from 'react'

export function usePreventNavigationScroll() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleWheel = (e: WheelEvent) => {
      // Prevent horizontal navigation gesture
      if (Math.abs(e.deltaX) > 0 && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault()
      }
    }

    // Add passive: false to allow preventDefault
    window.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      window.removeEventListener('wheel', handleWheel)
    }
  }, [])
}
