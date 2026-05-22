// Adapted from bball repo (src/pages/ProductImageCreation.tsx).
//
// Deltas vs bball:
//   - PRODUCT_CATEGORIES read from src/running-japan/garments.ts. The
//     "basketball" accessories type is dropped (not in running-japan scope).
//   - LOCATIONS read from src/running-japan/references.ts.
//   - Prompt templates collapsed into a single generic "editorial product
//     photography" template that interpolates the running location's
//     `prompt` field. The bball verbose location-specific templates (NY
//     court, Venice Beach, etc.) are dropped — they're too sport-specific
//     to keep, and a generic template is the right placeholder until the
//     adidas content team delivers running-specific copy.
//   - After every successful generation the new asset row is tagged with
//     category = 'running-japan'.
//   - URL state machine (?type=...&product=...&location=...&model=...&garment=...)
//     and overall layout (Step 1 product grid → Step 2 configure) are verbatim.

import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Shirt, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { useAssetContext } from '@/contexts/AssetContext'
import { CATEGORY_SLUG } from '@/walking-motioncore'
import { LOCATIONS_BY_ID } from '@/walking-motioncore/references'
import { SHOES, TOPS, BOTTOMS, PRODUCTS_BY_ID } from '@/walking-motioncore/garments'
import { getModelById, type ModelId } from '@/components/image-creation/ModelSelector'
import { SelectionModal } from '@/components/image-creation/SelectionModal'
import { OptimizedImage } from '@/components/image-creation/OptimizedImage'
import type { ProductCategory } from '@/components/image-creation/ProductPicker'

type ProductType = 'shoes' | 'tops' | 'bottoms'

interface ProductGridItem {
  id: string
  name: string
  image: string
  payloadImage: string
}

const PRODUCT_CATEGORIES: Record<ProductType, ProductGridItem[]> = {
  shoes: SHOES.map((p) => ({ id: p.id, name: p.name, image: p.thumbnailUrl, payloadImage: p.payloadUrl })),
  tops: TOPS.map((p) => ({ id: p.id, name: p.name, image: p.thumbnailUrl, payloadImage: p.payloadUrl })),
  bottoms: BOTTOMS.map((p) => ({ id: p.id, name: p.name, image: p.thumbnailUrl, payloadImage: p.payloadUrl })),
}

const PRODUCT_TYPE_NAMES: Record<ProductType, string> = {
  shoes: 'pair of running shoes',
  tops: 'top',
  bottoms: 'bottoms',
}

// Generic editorial product photo template. The [location] placeholder gets
// replaced with the running location's prompt string from references.ts.
// Used for tops and bottoms. Shoes use the shoes-specific template below
// because it needs skin tone + bottom garment context for the held-shoe shot.
const GENERIC_PRODUCT_PROMPT =
  'Beautiful close-up product editorial photograph of this [garment], photographed naturally with shallow depth of field. The [garment] sits or hangs as if just placed there, fabric falling with authentic folds. Scene: [location]. 35mm photography, natural film grain. Beautiful texture, premium materials.'

const SHOES_PROMPT =
  'Beautiful close-up product editorial photograph of this [garment] being held by a [skintone] [gender] hand wearing [bottom_garment]. The hand carries the pair of shoes by inserting fingers into the interior of both shoes simultaneously, gripping from the inside heel area so they dangle together naturally. Tight close-up composition showing premium details, laces, and textures. Scene: [location]. 35mm photography, natural film grain, shallow depth of field with shoes in sharp focus.'

const ProductImageCreation: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { refreshAssets } = useAssetContext()
  const [isGenerating, setIsGenerating] = useState(false)
  const [viewSide, setViewSide] = useState<'front' | 'back'>('front')
  const [activeCategory, setActiveCategory] = useState<ProductCategory | null>(null)

  const productType = searchParams.get('type') as ProductType | null
  const productId = searchParams.get('product')
  const locationId = searchParams.get('location') || null
  const gender = searchParams.get('gender') as 'male' | 'female' | null
  const modelId = searchParams.get('model') as ModelId | null
  const garmentId = searchParams.get('garment')

  const selectedProduct = productType && productId
    ? PRODUCT_CATEGORIES[productType]?.find((p) => p.id === productId) || null
    : null

  const selectedGarment = garmentId ? PRODUCT_CATEGORIES.bottoms.find((p) => p.id === garmentId) || null : null

  const handleModelSelect = (selectedModelId: ModelId) => {
    const model = getModelById(selectedModelId)
    if (!model || !productType || !productId) return
    const params: Record<string, string> = {
      type: productType,
      product: productId,
      gender: model.gender,
      model: selectedModelId,
    }
    if (locationId) params.location = locationId
    if (garmentId) params.garment = garmentId
    setSearchParams(params)
  }

  const handleLocationSelect = (location: string) => {
    if (!productType || !productId) return
    const params: Record<string, string> = { type: productType, product: productId, location }
    if (productType === 'shoes' && gender && modelId) {
      params.gender = gender
      params.model = modelId
    }
    if (garmentId) params.garment = garmentId
    setSearchParams(params)
  }

  const handleSelectGarment = (slot: 'tops' | 'bottoms' | 'shoes', itemId: string) => {
    if (slot !== 'bottoms' || !productType || !productId) return
    const params: Record<string, string> = { type: productType, product: productId, garment: itemId }
    if (locationId) params.location = locationId
    if (productType === 'shoes' && gender && modelId) {
      params.gender = gender
      params.model = modelId
    }
    setSearchParams(params)
    setActiveCategory(null)
  }

  const handleBackToProductGrid = () => setSearchParams({})

  const tagAssetCategory = async (assetId: string) => {
    await supabase.from('assets').update({ category: CATEGORY_SLUG }).eq('id', assetId)
  }

  const handleGenerate = async () => {
    if (!productType || !selectedProduct || !locationId) {
      toast.error('Please complete all selections')
      return
    }
    if (productType === 'shoes' && (!gender || !modelId)) {
      toast.error('Please select gender and model for shoes')
      return
    }

    setIsGenerating(true)
    try {
      const garmentName = PRODUCT_TYPE_NAMES[productType]
      const location = LOCATIONS_BY_ID[locationId]
      const locationPrompt = location?.prompt || 'natural editorial location'

      let promptTemplate = productType === 'shoes' ? SHOES_PROMPT : GENERIC_PRODUCT_PROMPT
      let prompt = promptTemplate
        .replace(/\[garment\]/g, garmentName)
        .replace(/\[location\]/g, locationPrompt)

      if (productType === 'shoes' && modelId && gender) {
        const model = getModelById(modelId)
        const skinTone = model?.skinTone || 'neutral'
        const bottomGarment = selectedGarment ? `these ${selectedGarment.name.toLowerCase()}` : 'these running bottoms'
        prompt = prompt
          .replace(/\[skintone\]/g, skinTone)
          .replace(/\[gender\]/g, gender)
          .replace(/\[bottom_garment\]/g, bottomGarment)
      }

      const additionalImages: string[] = []
      if (productType === 'shoes' && selectedGarment) {
        additionalImages.push(selectedGarment.payloadImage)
      }

      // Pose-aware view selection for back-view tops, if available
      let productImageUrl = selectedProduct.payloadImage
      if (productType === 'tops' && viewSide === 'back') {
        const productEntry = PRODUCTS_BY_ID[selectedProduct.id]
        if (productEntry?.backViewUrl) productImageUrl = productEntry.backViewUrl
      }

      const requestBody = {
        productType,
        productName: selectedProduct.name,
        productImage: productImageUrl,
        additionalImages: additionalImages.length > 0 ? additionalImages : undefined,
        location: locationId,
        prompt,
        aspect_ratio: '1:1',
        category: CATEGORY_SLUG,
      }

      const { data, error } = await supabase.functions.invoke('generate-product', { body: requestBody })
      if (error) {
        toast.error(`Failed to start generation: ${error.message}`)
        return
      }
      if (data?.success) {
        if (data.assetId) await tagAssetCategory(data.assetId)
        toast.success('Generating product images!')
        refreshAssets()
        navigate('/gallery')
      } else {
        toast.error(data?.error || 'Failed to start generation')
      }
    } catch {
      toast.error('Failed to generate product image. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  // Step 1: product grid
  if (!productType || !selectedProduct) {
    const categoryOrder: { key: ProductType; label: string }[] = [
      { key: 'shoes', label: 'Shoes' },
      { key: 'tops', label: 'Tops' },
      { key: 'bottoms', label: 'Bottoms' },
    ]

    return (
      <div className="h-full flex flex-col bg-white">
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/image-creation')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-semibold text-gray-900">Product Images</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {categoryOrder.map(({ key, label }) => (
            <div key={key} className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-200 pb-1.5">{label}</h3>
              <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10 gap-3">
                {PRODUCT_CATEGORIES[key].map((product) => (
                  <button
                    key={product.id}
                    onClick={() => setSearchParams({ type: key, product: product.id })}
                    className="group relative bg-white rounded-lg border border-gray-200 hover:border-black shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
                  >
                    <div className="aspect-square bg-gray-100 flex items-center justify-center p-2">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="px-2 py-1.5">
                      <h3 className="text-xs font-medium text-gray-900 text-center line-clamp-1">{product.name}</h3>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Step 2: configure shot
  const selectedModelData = modelId ? getModelById(modelId) : null
  const selectedLocationData = locationId ? LOCATIONS_BY_ID[locationId] : undefined
  const canGenerate = productType === 'shoes' ? Boolean(locationId && modelId) : Boolean(locationId)

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBackToProductGrid}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold text-gray-900">{selectedProduct.name} — Configure Shot</h1>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center overflow-auto">
        <div className="flex items-stretch justify-center">
          {productType === 'shoes' && (
            <>
              <div className="flex flex-col items-center px-8">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 text-center">Bottoms</h2>
                <button
                  onClick={() => setActiveCategory('bottoms')}
                  className={cn(
                    'w-[220px] h-[220px] rounded-xl border-2 transition-all duration-200 overflow-hidden',
                    'bg-white cursor-pointer flex flex-col items-center justify-center',
                    garmentId ? 'border-black' : 'border-gray-200 hover:border-black',
                  )}
                >
                  {selectedGarment ? (
                    <div className="w-full h-full overflow-hidden flex items-center justify-center p-4 bg-gray-50">
                      <img src={selectedGarment.image} alt={selectedGarment.name} className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Shirt className="h-10 w-10 text-gray-400" />
                      <span className="text-sm font-medium text-gray-500">Select Bottoms</span>
                    </div>
                  )}
                </button>
              </div>

              <div className="w-px bg-gray-200 self-stretch" />

              <div className="flex flex-col items-center px-8">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 text-center">Hand Model</h2>
                <button
                  onClick={() => setActiveCategory('model')}
                  className={cn(
                    'w-[220px] h-[220px] rounded-xl border-2 transition-all duration-200 overflow-hidden',
                    'bg-white cursor-pointer flex flex-col items-center justify-center',
                    modelId ? 'border-black' : 'border-gray-200 hover:border-black',
                  )}
                >
                  {selectedModelData ? (
                    <div className="w-full h-full overflow-hidden">
                      <OptimizedImage
                        src={selectedModelData.thumbnailUrl || selectedModelData.faceUrl}
                        alt={selectedModelData.name}
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <User className="h-10 w-10 text-gray-400" />
                      <span className="text-sm font-medium text-gray-500">Select Model</span>
                    </div>
                  )}
                </button>
              </div>

              <div className="w-px bg-gray-200 self-stretch" />
            </>
          )}

          {productType === 'tops' && (
            <>
              <div className="flex flex-col items-center px-8">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 text-center">Product View</h2>
                <div className="w-[220px] h-[220px] rounded-xl border-2 border-black overflow-hidden bg-gray-50 flex items-center justify-center p-4">
                  {(() => {
                    const productEntry = PRODUCTS_BY_ID[selectedProduct.id]
                    let displayUrl = selectedProduct.image
                    if (viewSide === 'back' && productEntry?.backViewUrl) displayUrl = productEntry.backViewUrl
                    return <img src={displayUrl} alt={`${selectedProduct.name} ${viewSide}`} className="w-full h-full object-contain" />
                  })()}
                </div>
                <div className="mt-3">
                  <ToggleGroup
                    type="single"
                    value={viewSide}
                    onValueChange={(value) => value && setViewSide(value as 'front' | 'back')}
                    className="bg-gray-100 p-1 rounded-lg"
                  >
                    <ToggleGroupItem value="front" className="data-[state=on]:bg-white data-[state=on]:text-black px-6 py-1.5 rounded-md font-medium text-sm">
                      Front
                    </ToggleGroupItem>
                    <ToggleGroupItem value="back" className="data-[state=on]:bg-white data-[state=on]:text-black px-6 py-1.5 rounded-md font-medium text-sm">
                      Back
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
              <div className="w-px bg-gray-200 self-stretch" />
            </>
          )}

          {(productType === 'shoes' || productType === 'tops' || productType === 'bottoms') && (
            <div className="flex flex-col items-center px-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 text-center">Location</h2>
              <button
                onClick={() => setActiveCategory('location')}
                className={cn(
                  'w-[220px] h-[220px] rounded-xl border-2 transition-all duration-200 overflow-hidden',
                  'bg-white cursor-pointer flex flex-col',
                  locationId ? 'border-black' : 'border-gray-200 hover:border-black',
                )}
              >
                {selectedLocationData ? (
                  <>
                    <div className="flex-1 bg-gray-100">
                      <OptimizedImage src={selectedLocationData.thumbnailUrl} alt={selectedLocationData.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-3 flex-shrink-0">
                      <p className="text-sm font-medium text-gray-900 text-center">{selectedLocationData.name}</p>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2">
                    <MapPin className="h-10 w-10 text-gray-400" />
                    <span className="text-sm font-medium text-gray-500">Select Location</span>
                  </div>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center mt-[6vh]">
          <Button
            size="lg"
            className={cn(
              'px-8 font-medium transition-colors',
              canGenerate && !isGenerating
                ? 'bg-black text-white hover:bg-gray-800'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            )}
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Generate Product Image'}
          </Button>
        </div>
      </div>

      <SelectionModal
        isOpen={activeCategory !== null}
        onClose={() => setActiveCategory(null)}
        category={activeCategory}
        onSelectGarment={handleSelectGarment}
        selectedItem={garmentId || undefined}
        selectedPoses={[]}
        onPosesSelect={() => {}}
        onModelSelect={handleModelSelect}
        selectedModel={modelId || undefined}
        onLocationSelect={handleLocationSelect}
        selectedLocation={locationId || undefined}
      />
    </div>
  )
}

export default ProductImageCreation
