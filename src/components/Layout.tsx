import { Link, Outlet, useNavigate } from 'react-router-dom'
import { CATEGORY_DISPLAY_NAME } from '@/running-japan'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'

export function Layout() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const onSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-semibold tracking-tight text-neutral-900">
            adiGen <span className="text-neutral-400">/ {CATEGORY_DISPLAY_NAME}</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-neutral-600">
            <Link to="/copy-generator" className="hover:text-neutral-900">
              Copy Generator
            </Link>
            <Link to="/toolkit" className="hover:text-neutral-900">
              Cropping Toolkit
            </Link>
            <Link to="/lifestyle" className="hover:text-neutral-900">
              Lifestyle Gen
            </Link>
            <Link to="/gallery" className="hover:text-neutral-900">
              Gallery
            </Link>
            {user ? (
              <>
                <span className="text-neutral-400">{user.email}</span>
                <button onClick={onSignOut} className="text-neutral-600 hover:text-neutral-900">
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/login" className="rounded-md bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-800">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}
