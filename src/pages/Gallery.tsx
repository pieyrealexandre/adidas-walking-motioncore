import { useState } from 'react'
import { useAssetContext } from '@/contexts/AssetContext'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Loader2, Heart, User, RefreshCw, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const Gallery = () => {
  const {
    assets,
    isLoading,
    hasMore,
    loadMore,
    refreshAssets,
    error,
    filterMode,
    setFilterMode,
    toggleAssetFavorite,
  } = useAssetContext()
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true)
    await refreshAssets()
    setIsManualRefreshing(false)
  }

  const getImageSource = (asset: any) => asset.thumbnail_url || asset.image_url

  return (
    <div className="flex flex-col">
      <div className="pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gallery</h1>
          <p className="text-muted-foreground mt-2">
            {filterMode === 'favorites'
              ? 'Your favorite images'
              : filterMode === 'mine'
                ? 'Images you generated'
                : 'Browse all AI-generated images'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ToggleGroup
            type="single"
            value={filterMode}
            onValueChange={(value) => {
              if (value === 'all' || value === 'mine' || value === 'favorites') {
                setFilterMode(value)
              }
            }}
            className="border rounded-lg p-1"
          >
            <ToggleGroupItem value="all" aria-label="Show all images">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="mine" aria-label="Show only my images">
              <User className="h-4 w-4 mr-2" />
              My Images
            </ToggleGroupItem>
            <ToggleGroupItem value="favorites" aria-label="Show favorites only">
              <Heart className="h-4 w-4 mr-2" />
              Favorites
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            onClick={handleManualRefresh}
            disabled={isManualRefreshing}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', isManualRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-red-300 bg-red-50 rounded-md p-3 flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            {error}.{' '}
            <button onClick={handleManualRefresh} className="underline">
              Try again
            </button>
          </div>
        </div>
      )}

      {assets.length === 0 && !isLoading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground text-lg">
            {filterMode === 'favorites'
              ? 'No favorites yet.'
              : filterMode === 'mine'
                ? "You haven't generated any images yet."
                : 'No images found. Start creating!'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {assets.map((asset) => {
              const src = getImageSource(asset)
              const isPending = !src || asset.status === 'pending' || asset.status === 'processing'
              return (
                <div
                  key={asset.id}
                  className="bg-muted rounded-lg overflow-hidden shadow-sm hover:shadow-md relative aspect-square"
                >
                  {isPending ? (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                        <span className="text-xs text-gray-500">Generating…</span>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={src}
                      alt="Generated"
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  )}
                  {!isPending && (
                    <button
                      className="absolute top-2 left-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition-colors"
                      onClick={() => toggleAssetFavorite(asset.id)}
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

          {hasMore && (
            <div className="flex justify-center py-8">
              <Button onClick={loadMore} disabled={isLoading} variant="outline">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading…
                  </>
                ) : (
                  'Load more'
                )}
              </Button>
            </div>
          )}

          {!hasMore && assets.length > 0 && (
            <div className="flex justify-center py-8">
              <p className="text-muted-foreground">End of gallery</p>
            </div>
          )}
        </>
      )}

      {isLoading && assets.length === 0 && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

export default Gallery
