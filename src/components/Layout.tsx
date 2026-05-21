// Adapted from bball repo (src/components/Layout.tsx).
//
// Deltas vs bball:
//   - No Header component rendered (bball's Header is already empty in v1).
//   - GenerationProgressWidget omitted — that widget polls for completion and
//     shows a floating progress card. Adding it later is straightforward once
//     the rest of the lifestyle flow is stable.
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { cn } from '@/lib/utils'

const FULL_BLEED_ROUTES = ['/image-creation/lifestyle']

const Layout = () => {
  const location = useLocation()
  const isFullBleed = FULL_BLEED_ROUTES.includes(location.pathname)

  return (
    <div className="h-screen bg-background flex w-full">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className={cn('flex-1 overflow-auto h-screen', !isFullBleed && 'p-2 sm:p-4 lg:p-6')}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
