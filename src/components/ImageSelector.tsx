// Ported verbatim from bball repo (src/components/ImageSelector.tsx).
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileImage, Video } from 'lucide-react'
import type { OptimizedAsset } from '@/hooks/useSimpleAssets'

interface ImageSelectorProps {
  selectedReference: string | null
  onReferenceSelect: (imageUrl: string) => void
  assets: OptimizedAsset[]
}

const ImageSelector = ({ selectedReference, onReferenceSelect, assets }: ImageSelectorProps) => {
  if (assets.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileImage className="h-5 w-5" />
              <span>No Images Available</span>
            </CardTitle>
            <CardDescription>No generated images available yet</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <FileImage className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">Generate your first image</p>
              <p className="text-sm text-muted-foreground mt-1">
                Go to Image Creation to generate images first
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="group relative block cursor-pointer"
            tabIndex={0}
            role="button"
            aria-label="View image"
            onClick={() => onReferenceSelect(asset.image_url)}
          >
            <div
              className={`aspect-square bg-muted rounded-lg border-2 transition-colors overflow-hidden relative ${
                selectedReference === asset.image_url
                  ? 'border-primary'
                  : 'border-muted hover:border-primary'
              }`}
            >
              <img
                src={asset.image_url}
                alt="Generated image"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                loading="lazy"
              />
              <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1 py-0.5 rounded">
                AI
              </div>
              {asset.asset_type === 'video' && (
                <div className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1">
                  <Video className="h-3 w-3" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ImageSelector
