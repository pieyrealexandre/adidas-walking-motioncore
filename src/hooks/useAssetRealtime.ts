// Ported verbatim from bball repo (src/hooks/useAssetRealtime.ts). Module-level
// singleton channel so multiple hook subscribers share one Realtime connection.
import { useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export type AssetChangePayload = RealtimePostgresChangesPayload<Record<string, any>>
export type AssetChangeCallback = (payload: AssetChangePayload) => void

let sharedChannel: RealtimeChannel | null = null
let subscriberCount = 0
const callbacks = new Set<AssetChangeCallback>()

export const useAssetRealtime = (callback: AssetChangeCallback) => {
  const { user } = useAuth()
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!user) return

    const wrappedCallback: AssetChangeCallback = (payload) => {
      callbackRef.current(payload)
    }

    callbacks.add(wrappedCallback)
    subscriberCount++

    if (!sharedChannel) {
      sharedChannel = supabase
        .channel('assets-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'assets',
          },
          (payload: AssetChangePayload) => {
            callbacks.forEach((cb) => cb(payload))
          },
        )
        .subscribe()
    }

    return () => {
      callbacks.delete(wrappedCallback)
      subscriberCount--

      if (subscriberCount === 0) {
        setTimeout(() => {
          if (subscriberCount === 0 && sharedChannel) {
            supabase.removeChannel(sharedChannel)
            sharedChannel = null
          }
        }, 1000)
      }
    }
  }, [user])
}
