import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { CATEGORY_SLUG } from '@/running-japan'
import { toast } from 'sonner'

export type GalleryFilterMode = 'all' | 'mine' | 'favorites'

export interface OptimizedAsset {
  id: string
  user_id: string | null
  asset_type: 'image' | 'video' | string
  image_url: string | null
  thumbnail_url: string | null
  reference_image_url: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed' | string | null
  is_favorite: boolean
  created_at: string
}

interface AssetContextType {
  assets: OptimizedAsset[]
  isLoading: boolean
  error: string | null
  refreshAssets: () => Promise<void>
  hasMore: boolean
  loadMore: () => Promise<void>
  filterMode: GalleryFilterMode
  setFilterMode: (mode: GalleryFilterMode) => void
  toggleAssetFavorite: (assetId: string) => Promise<void>
}

const AssetContext = createContext<AssetContextType | undefined>(undefined)

const PAGE_SIZE = 24

export const useAssetContext = () => {
  const ctx = useContext(AssetContext)
  if (!ctx) throw new Error('useAssetContext must be used within an AssetProvider')
  return ctx
}

// Assets are tagged with `category = 'running-japan'` per the v1 data
// isolation strategy. We filter every query by category so the UI never sees
// bball rows even if RLS would also permit them.
async function fetchAssets(opts: {
  page: number
  filterMode: GalleryFilterMode
  userId: string | null
}): Promise<{ rows: OptimizedAsset[]; hasMore: boolean }> {
  const from = opts.page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('assets')
    .select('*')
    .eq('category', CATEGORY_SLUG)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (opts.filterMode === 'mine' && opts.userId) {
    query = query.eq('user_id', opts.userId)
  } else if (opts.filterMode === 'favorites') {
    query = query.eq('is_favorite', true)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = (data || []) as OptimizedAsset[]
  return { rows, hasMore: rows.length === PAGE_SIZE }
}

export const AssetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [assets, setAssets] = useState<OptimizedAsset[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterMode, setFilterMode] = useState<GalleryFilterMode>('all')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const refreshAssets = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { rows, hasMore } = await fetchAssets({ page: 0, filterMode, userId })
      setAssets(rows)
      setHasMore(hasMore)
      setPage(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assets')
    } finally {
      setIsLoading(false)
    }
  }, [filterMode, userId])

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading) return
    setIsLoading(true)
    try {
      const next = page + 1
      const { rows, hasMore: more } = await fetchAssets({ page: next, filterMode, userId })
      setAssets((prev) => [...prev, ...rows])
      setHasMore(more)
      setPage(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more')
    } finally {
      setIsLoading(false)
    }
  }, [page, hasMore, isLoading, filterMode, userId])

  useEffect(() => {
    refreshAssets()
  }, [refreshAssets])

  const toggleAssetFavorite = useCallback(
    async (assetId: string) => {
      const current = assets.find((a) => a.id === assetId)
      if (!current) return
      const next = !current.is_favorite
      setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, is_favorite: next } : a)))
      const { error } = await supabase.from('assets').update({ is_favorite: next }).eq('id', assetId)
      if (error) {
        setAssets((prev) =>
          prev.map((a) => (a.id === assetId ? { ...a, is_favorite: current.is_favorite } : a)),
        )
        toast.error('Failed to update favorite')
      }
    },
    [assets],
  )

  return (
    <AssetContext.Provider
      value={{
        assets,
        isLoading,
        error,
        refreshAssets,
        hasMore,
        loadMore,
        filterMode,
        setFilterMode,
        toggleAssetFavorite,
      }}
    >
      {children}
    </AssetContext.Provider>
  )
}
