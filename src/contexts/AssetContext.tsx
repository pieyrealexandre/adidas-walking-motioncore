// Ported verbatim from bball repo (src/contexts/AssetContext.tsx).
// Wraps useSimpleAssets, adds optimistic favorite toggling.
import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import { useSimpleAssets, type OptimizedAsset, type GalleryFilterMode } from '@/hooks/useSimpleAssets'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

interface AssetContextType {
  assets: OptimizedAsset[]
  isLoading: boolean
  error: string | null
  refreshAssets: () => Promise<void>
  hasMore: boolean
  loadMore: () => Promise<void>
  lastRefresh: number
  filterMode: GalleryFilterMode
  setFilterMode: (mode: GalleryFilterMode) => void
  toggleAssetFavorite: (assetId: string) => Promise<void>
}

const AssetContext = createContext<AssetContextType | undefined>(undefined)

export const useAssetContext = () => {
  const ctx = useContext(AssetContext)
  if (!ctx) throw new Error('useAssetContext must be used within an AssetProvider')
  return ctx
}

export const AssetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [filterMode, setFilterMode] = useState<GalleryFilterMode>('all')
  const { assets, isLoading, error, hasMore, loadMore, refreshAssets } = useSimpleAssets(12, filterMode)
  const prevFilterMode = useRef(filterMode)
  const [localAssets, setLocalAssets] = useState<OptimizedAsset[]>([])

  const displayAssets = localAssets.length > 0 ? localAssets : assets

  React.useEffect(() => {
    setLocalAssets(assets)
  }, [assets])

  React.useEffect(() => {
    if (prevFilterMode.current === filterMode) return
    prevFilterMode.current = filterMode
    refreshAssets()
  }, [filterMode, refreshAssets])

  const toggleAssetFavorite = useCallback(
    async (assetId: string) => {
      const current = displayAssets.find((a) => a.id === assetId)
      if (!current) return
      const next = !current.is_favorite

      setLocalAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, is_favorite: next } : a)),
      )

      try {
        const { error } = await supabase.from('assets').update({ is_favorite: next }).eq('id', assetId)
        if (error) {
          setLocalAssets((prev) =>
            prev.map((a) => (a.id === assetId ? { ...a, is_favorite: current.is_favorite } : a)),
          )
          toast.error('Failed to update favorite')
        }
      } catch {
        setLocalAssets((prev) =>
          prev.map((a) => (a.id === assetId ? { ...a, is_favorite: current.is_favorite } : a)),
        )
        toast.error('Failed to update favorite')
      }
    },
    [displayAssets],
  )

  return (
    <AssetContext.Provider
      value={{
        assets: displayAssets,
        isLoading,
        error,
        refreshAssets,
        hasMore,
        loadMore,
        lastRefresh: Date.now(),
        filterMode,
        setFilterMode,
        toggleAssetFavorite,
      }}
    >
      {children}
    </AssetContext.Provider>
  )
}

export type { OptimizedAsset, GalleryFilterMode }
