import { Link, Outlet } from 'react-router-dom'
import { CATEGORY_DISPLAY_NAME } from '@/running-japan'

export function Layout() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-semibold tracking-tight text-neutral-900">
            adiGen <span className="text-neutral-400">/ {CATEGORY_DISPLAY_NAME}</span>
          </Link>
          <nav className="flex gap-4 text-sm text-neutral-600">
            <Link to="/copy-generator" className="hover:text-neutral-900">
              Copy Generator
            </Link>
            <Link to="/toolkit" className="hover:text-neutral-900">
              Cropping Toolkit
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}
