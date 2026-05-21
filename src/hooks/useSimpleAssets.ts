// Ported from bball repo (src/hooks/useSimpleAssets.ts).
//
// Two deltas vs bball:
//   1. Query filters by `category = 'running-japan'` (Phase 1 isolation strategy).
//   2. Realtime INSERT events skip rows whose category is not running-japan,
//      so bball's writes don't leak into adiGen's gallery.
//
// Everything else (cache, abort handling, realtime UPDATE/DELETE handling,
// loadMore, refreshAssets, visibility-change refresh) is verbatim.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { CATEGORY_SLUG } from '@/running-japan'
import { useAssetRealtime, type AssetChangePayload } from './useAssetRealtime'

export interface OptimizedAsset {
  id: string
  image_url: string
  thumbnail_url?: string | null
  created_at: string
  status: string
  asset_type?: string
  reference_image_url?: string | null
  prompt?: string
  width?: number | null
  height?: number | null
  is_favorite?: boolean
}

const cache = {
  data: [] as OptimizedAsset[],
  timestamp: 0,
  isLoading: false,
  CACHE_DURATION: 30000,
}

export type GalleryFilterMode = 'all' | 'mine' | 'favorites'

export const useSimpleAssets = (limit: number = 12, filterMode: GalleryFilterMode = 'all') => {
  const [assets, setAssets] = useState<OptimizedAsset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const { user } = useAuth()
  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const fetchAssets = useCallback(
    async (offset: number = 0, shouldAppend: boolean = false) => {
      if (!user) {
        setAssets([])
        setIsLoading(false)
        setHasMore(false)
        return
      }

      if (offset === 0 && !shouldAppend) {
        const now = Date.now()
        if (cache.data.length > 0 && now - cache.timestamp < cache.CACHE_DURATION) {
          setAssets(cache.data)
          setIsLoading(false)
          setHasMore(cache.data.length === limit)
          return
        }
      }

      if (cache.isLoading && offset === 0 && !shouldAppend && assets.length > 0) return

      if (abortControllerRef.current) abortControllerRef.current.abort()
      const abortController = new AbortController()
      abortControllerRef.current = abortController
      cache.isLoading = true

      try {
        setError(null)
        if (!shouldAppend) setIsLoading(true)

        let query = supabase
          .from('assets')
          .select('id, image_url, thumbnail_url, created_at, status, asset_type, reference_image_url, prompt, is_favorite')
          .eq('category', CATEGORY_SLUG)
          .in('status', ['completed', 'processing', 'pending'])

        if (filterMode === 'favorites') {
          query = query.eq('is_favorite', true)
        } else if (filterMode === 'mine') {
          query = query.eq('user_id', user.id)
        }

        const { data, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1)

        if (abortController.signal.aborted || !isMountedRef.current) return

        if (error) {
          setError(error.message)
          setIsLoading(false)
          return
        }

        const newAssets = data || []

        if (shouldAppend) {
          setAssets((prev) => {
            const existingIds = new Set(prev.map((a) => a.id))
            const unique = newAssets.filter((a) => !existingIds.has(a.id))
            return [...prev, ...unique]
          })
        } else {
          setAssets(newAssets)
          if (newAssets.length > 0 || offset === 0) {
            cache.data = newAssets
            cache.timestamp = Date.now()
          }
        }

        setHasMore(newAssets.length === limit)
        setIsLoading(false)
        cache.isLoading = false
        abortControllerRef.current = null
      } catch (err: any) {
        if (err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Failed to fetch assets')
        setIsLoading(false)
        cache.isLoading = false
        abortControllerRef.current = null
      }
    },
    [user, limit, filterMode],
  )

  const loadMore = useCallback(async () => {
    if (!isLoading && hasMore) {
      await fetchAssets(assets.length, true)
    }
  }, [fetchAssets, assets.length, isLoading, hasMore])

  const refreshAssets = useCallback(async () => {
    cache.data = []
    cache.timestamp = 0
    await fetchAssets(0, false)
  }, [fetchAssets])

  useEffect(() => {
    fetchAssets()
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }
  }, [fetchAssets])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
          const now = Date.now()
          if (now - cache.timestamp > 10000) refreshAssets()
        }, 1000)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearTimeout(timeoutId)
    }
  }, [refreshAssets, user])

  const handleAssetChange = useCallback(
    (payload: AssetChangePayload) => {
      if (payload.eventType === 'UPDATE') {
        const updated = payload.new
        setAssets((prev) => {
          const idx = prev.findIndex((a) => a.id === updated.id)
          if (idx === -1) return prev
          const current = prev[idx]
          if (
            current.status === updated.status &&
            current.image_url === updated.image_url &&
            current.thumbnail_url === updated.thumbnail_url
          ) {
            return prev
          }
          const next = [...prev]
          next[idx] = {
            ...current,
            status: updated.status,
            image_url: updated.image_url,
            thumbnail_url: updated.thumbnail_url ?? current.thumbnail_url,
            is_favorite: updated.is_favorite ?? current.is_favorite,
          }
          if (cache.data.length > 0) {
            cache.data = next
            cache.timestamp = Date.now()
          }
          return next
        })
      } else if (payload.eventType === 'INSERT') {
        const newAsset = payload.new
        // adiGen-specific: ignore inserts from other categories (e.g. bball).
        if (newAsset.category !== CATEGORY_SLUG) return
        setAssets((prev) => {
          if (prev.some((a) => a.id === newAsset.id)) return prev
          if (filterMode === 'favorites' && !newAsset.is_favorite) return prev
          if (filterMode === 'mine' && newAsset.user_id !== user?.id) return prev
          const assetToAdd: OptimizedAsset = {
            id: newAsset.id,
            image_url: newAsset.image_url,
            thumbnail_url: newAsset.thumbnail_url ?? null,
            created_at: newAsset.created_at,
            status: newAsset.status,
            asset_type: newAsset.asset_type,
            reference_image_url: newAsset.reference_image_url ?? null,
            prompt: newAsset.prompt,
            is_favorite: newAsset.is_favorite ?? false,
          }
          const updated = [assetToAdd, ...prev]
          if (cache.data.length > 0) {
            cache.data = updated
            cache.timestamp = Date.now()
          }
          return updated
        })
      } else if (payload.eventType === 'DELETE') {
        const deleted = payload.old
        if (!deleted?.id) return
        setAssets((prev) => {
          const filtered = prev.filter((a) => a.id !== deleted.id)
          if (filtered.length === prev.length) return prev
          if (cache.data.length > 0) {
            cache.data = filtered
            cache.timestamp = Date.now()
          }
          return filtered
        })
      }
    },
    [filterMode, user?.id],
  )

  useAssetRealtime(handleAssetChange)

  return {
    assets,
    isLoading,
    error,
    hasMore,
    loadMore,
    refreshAssets,
  }
}
