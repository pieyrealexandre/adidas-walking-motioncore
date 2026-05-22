// Adapted from bball repo (src/pages/Dashboard.tsx).
//
// bball's Dashboard composes two components we don't have ported yet —
// RecentCreationsGallery and PhotographyTypeSelection — neither file is in
// bball-ref/src/components. Until they're added, we inline the *exact*
// thumbnail markup that bball-ref/src/pages/Gallery.tsx uses for asset tiles
// (bg-muted rounded-lg overflow-hidden ... aspect-square + Heart overlay).
// That keeps the recent-creations strip visually consistent with the rest of
// bball's gallery surface — no new design language invented here.

import { useNavigate } from 'react-router-dom'
import { Heart, Loader2, Video } from 'lucide-react'
import { useAssetContext } from '@/contexts/AssetContext'
import { cn } from '@/lib/utils'

const RECENT_LIMIT = 12

const Dashboard = () => {
  const navigate = useNavigate()
  const { assets, isLoading, toggleAssetFavorite } = useAssetContext()

  const getImageSource = (asset: any) => asset.thumbnail_url || asset.image_url
  const recent = assets.slice(0, RECENT_LIMIT)

  const handleFavoriteClick = (e: React.MouseEvent, assetId: string) => {
    e.stopPropagation()
    toggleAssetFavorite(assetId)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        {recent.map((asset) => {
          const imageSource = getImageSource(asset)
          const isPending = !imageSource || asset.status === 'pending' || asset.status === 'processing'

          return (
            <div
              key={asset.id}
              className="bg-muted rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform duration-200 shadow-sm hover:shadow-md relative aspect-square"
              onClick={() => navigate('/gallery')}
            >
              {isPending ? (
                <div className="w-full h-full flex items-center justify-center bg-gray-100">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                    <span className="text-xs text-gray-500">Generating...</span>
                  </div>
                </div>
              ) : (
                <img
                  src={imageSource}
                  alt="Generated image"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                  }}
                />
              )}
              {asset.asset_type === 'video' && !isPending && (
                <div className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1">
                  <Video className="h-4 w-4" />
                </div>
              )}
              {!isPending && (
                <button
                  className="absolute top-2 left-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition-colors"
                  onClick={(e) => handleFavoriteClick(e, asset.id)}
                >
                  <Heart
                    className={cn('h-4 w-4', asset.is_favorite && 'fill-red-500 text-red-500')}
                  />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {recent.length === 0 && !isLoading && (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground text-lg">No images yet. Start creating!</p>
        </div>
      )}

      {isLoading && recent.length === 0 && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

export default Dashboard
