// Ported verbatim from bball repo (src/hooks/use-mobile.tsx).
//
// `useIsMobile` toggles at 768px (Tailwind's md breakpoint).
// `useIsSidebarCollapsed` toggles at 1300px — bball's chosen viewport where
// the sidebar shrinks to an icon strip and expands on hover.

import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const SIDEBAR_COLLAPSE_BREAKPOINT = 1300

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}

export function useIsSidebarCollapsed() {
  const [collapsed, setCollapsed] = React.useState(window.innerWidth < SIDEBAR_COLLAPSE_BREAKPOINT)

  React.useEffect(() => {
    const handler = () => setCollapsed(window.innerWidth < SIDEBAR_COLLAPSE_BREAKPOINT)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return collapsed
}
