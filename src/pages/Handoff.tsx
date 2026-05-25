import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'

// Consumes a session handed off by the adigen-hub. The hub redirects authed
// users to /auth/handoff with access_token + refresh_token in the URL hash;
// this page installs them as the local Supabase session, strips the hash, and
// sends the user to /. The AuthContext listener picks up the new session.
export default function Handoff() {
  const navigate = useNavigate()
  const ranRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const raw = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash
    const params = new URLSearchParams(raw)
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')

    if (!access_token || !refresh_token) {
      navigate('/login', { replace: true })
      return
    }

    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        window.history.replaceState(null, '', window.location.pathname)
        if (error) {
          setError(error.message)
          return
        }
        navigate('/', { replace: true })
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not complete sign-in.')
      })
  }, [navigate])

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-destructive">Could not complete sign-in.</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Back to login
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Signing you in…</p>
          </>
        )}
      </div>
    </main>
  )
}
