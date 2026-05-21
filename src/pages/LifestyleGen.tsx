import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAssetContext } from '@/contexts/AssetContext'
import { CATEGORY_SLUG } from '@/running-japan'
import { POSES, POSES_BY_ID, type RunningPose } from '@/running-japan/poses'
import { LOCATIONS_BY_ID, SCENE_STYLES_BY_ID } from '@/running-japan/references'
import { PRODUCTS_BY_ID } from '@/running-japan/garments'
import { getModelById, type ModelId } from '@/components/image-creation/ModelSelector'
import { SelectionModal, type LocationId, type SceneStyleId } from '@/components/image-creation/SelectionModal'
import { OptimizedImage } from '@/components/image-creation/OptimizedImage'
import { buildJSONPrompt, type Gender } from '@/utils/jsonPromptBuilder'
import { buildGarmentImageUrls } from '@/utils/garmentCombinations'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ProductCategory } from '@/components/image-creation/ProductPicker'

const DEFAULT_POSE = POSES[0]
const DEFAULT_SCENE_STYLE = 'golden_hour'

interface SelectedPose {
  id: string
  name: string
  image: string
}

const toSelectedPose = (p: RunningPose): SelectedPose => ({ id: p.id, name: p.name, image: p.image })

const LifestyleGen = () => {
  const navigate = useNavigate()
  const { refreshAssets } = useAssetContext()
  const [isGenerating, setIsGenerating] = useState(false)

  const [selectedProducts, setSelectedProducts] = useState<{
    shoes?: string
    tops?: string
    bottoms?: string
  }>({})
  const [selectedPoses, setSelectedPoses] = useState<SelectedPose[]>([toSelectedPose(DEFAULT_POSE)])
  const [activeCategory, setActiveCategory] = useState<ProductCategory | null>(null)
  const [selectedSceneStyle, setSelectedSceneStyle] = useState<SceneStyleId>(DEFAULT_SCENE_STYLE)
  const [selectedModel, setSelectedModel] = useState<ModelId | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<LocationId | null>(null)
  const [gazeDirection, setGazeDirection] = useState<'candid' | 'staring'>('candid')
  const [smileExpression, setSmileExpression] = useState<'smiling' | 'serious'>('smiling')
  const [lastGenerationPayloads, setLastGenerationPayloads] = useState<any[] | null>(null)

  const selectedGender: Gender | null = selectedModel
    ? (getModelById(selectedModel)?.gender as Gender) || null
    : null

  useEffect(() => {
    const stored = localStorage.getItem('lastLifestyleGeneration-running-japan')
    if (stored) {
      try {
        setLastGenerationPayloads(JSON.parse(stored))
      } catch {
        // ignore
      }
    }
  }, [])

  const handleSelectGarment = (slot: 'shoes' | 'tops' | 'bottoms', itemId: string) => {
    setSelectedProducts((prev) => ({ ...prev, [slot]: itemId }))
  }

  const handleGenerate = async () => {
    if (!selectedModel || !selectedGender) {
      toast.error('Please select a model')
      return
    }
    if (!selectedPoses || selectedPoses.length === 0) {
      toast.error('Please select at least one pose')
      return
    }
    if (!selectedLocation) {
      toast.error('Please select a location')
      return
    }

    setIsGenerating(true)
    try {
      const allPayloads: any[] = []
      let successCount = 0

      for (const pose of selectedPoses) {
        const poseData = POSES_BY_ID[pose.id]
        if (!poseData) continue

        const jsonPrompt = buildJSONPrompt({
          gender: selectedGender,
          poseId: pose.id,
          sceneStyleId: selectedSceneStyle,
          locationId: selectedLocation,
          modelId: selectedModel ?? undefined,
          gazeDirection,
          smileExpression,
          topsId: selectedProducts.tops,
          bottomsId: selectedProducts.bottoms,
          shoesId: selectedProducts.shoes,
        })

        const imageUrls: string[] = []

        // 1. Pose sketch (skip for descriptive-only poses)
        if (!poseData.descriptiveOnly) imageUrls.push(poseData.image)

        // 2. Garment images
        const garmentResult = buildGarmentImageUrls(selectedProducts, pose.id)
        imageUrls.push(...garmentResult.imageUrls)

        // 3. Per-pose prop reference (replaces bball's basketball hardcode)
        if (poseData.propImageUrl) imageUrls.push(poseData.propImageUrl)

        // 4. Model face (skip for poses where face isn't visible)
        if (poseData.visibleFace) {
          const model = getModelById(selectedModel)
          if (model?.faceUrl) imageUrls.push(model.faceUrl)
        }

        // 5. Model back image for back-view poses
        if (poseData.view === 'back') {
          const model = getModelById(selectedModel)
          if (model?.backUrl) imageUrls.push(model.backUrl)
        }

        if (imageUrls.length > 14) {
          toast.error(`Too many reference images for ${pose.name}.`)
          continue
        }

        const payload = {
          prompt: jsonPrompt,
          imageUrls,
          aspect_ratio: '1:1',
          category: CATEGORY_SLUG,
          display_prompt: `${pose.name} — ${selectedProducts.tops || ''} ${selectedProducts.bottoms || ''} ${selectedProducts.shoes || ''}`.trim(),
        }
        allPayloads.push(payload)

        const { data, error } = await supabase.functions.invoke('generate-image-pro', { body: payload })
        if (error) {
          toast.error(`Function error for ${pose.name}: ${error.message || 'Unknown error'}`)
          continue
        }
        if (data?.error) {
          toast.error(`API error for ${pose.name}: ${data.error}`)
          continue
        }
        if (data?.success) {
          successCount += 1
          // Tag the row with our category. The Edge Function lives in the bball
          // repo and doesn't know about `category`; without this UPDATE the new
          // row would be NULL-tagged and invisible to adiGen Gallery (and would
          // visually cross-contaminate bball). RLS lets users update their own
          // rows, so the client-side patch is sufficient until the Edge Function
          // is taught to read `category` from the payload.
          if (data.assetId) {
            await supabase
              .from('assets')
              .update({ category: CATEGORY_SLUG })
              .eq('id', data.assetId)
          }
        }
      }

      if (successCount === 0) {
        toast.error('Failed to start any generation')
        return
      }

      if (allPayloads.length > 0) {
        localStorage.setItem('lastLifestyleGeneration-running-japan', JSON.stringify(allPayloads))
        setLastGenerationPayloads(allPayloads)
      }

      toast.success(
        successCount === 1 ? 'Generation started for 1 image!' : `Started generating ${successCount} images!`,
      )
      navigate('/gallery')
      setTimeout(() => {
        refreshAssets()
      }, 200)
    } catch (e) {
      toast.error('Failed to generate. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRerunLast = async () => {
    if (!lastGenerationPayloads || lastGenerationPayloads.length === 0) {
      toast.error('No previous generation found')
      return
    }
    setIsGenerating(true)
    try {
      let successCount = 0
      for (const payload of lastGenerationPayloads) {
        const { data, error } = await supabase.functions.invoke('generate-image-pro', { body: payload })
        if (error || data?.error) continue
        if (data?.success) successCount += 1
      }
      if (successCount === 0) {
        toast.error('Failed to re-run generation')
        return
      }
      toast.success(`Re-generated ${successCount} image${successCount === 1 ? '' : 's'}!`)
      refreshAssets()
      navigate('/gallery')
    } finally {
      setIsGenerating(false)
    }
  }

  const currentLocation = selectedLocation ? LOCATIONS_BY_ID[selectedLocation] : undefined
  const currentSceneStyle = SCENE_STYLES_BY_ID[selectedSceneStyle]
  const currentModel = selectedModel ? getModelById(selectedModel) : undefined
  const topsItem = selectedProducts.tops ? PRODUCTS_BY_ID[selectedProducts.tops] : undefined
  const bottomsItem = selectedProducts.bottoms ? PRODUCTS_BY_ID[selectedProducts.bottoms] : undefined
  const shoesItem = selectedProducts.shoes ? PRODUCTS_BY_ID[selectedProducts.shoes] : undefined

  return (
    <div className="flex flex-col bg-white">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-foreground">Lifestyle Images</h1>
        {lastGenerationPayloads && lastGenerationPayloads.length > 0 && (
          <button
            onClick={handleRerunLast}
            disabled={isGenerating}
            className={cn(
              'h-8 px-3 bg-white border border-gray-200 rounded-md flex items-center transition-all duration-200',
              isGenerating
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-gray-50 hover:border-gray-300 cursor-pointer',
            )}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-gray-700" />
            <span className="text-xs text-gray-700">Re-run last</span>
          </button>
        )}
      </div>

      <div className="flex items-stretch gap-10">
        {/* Pose preview column */}
        <div className="flex flex-col items-center max-w-[600px] flex-1 min-w-0">
          <div className="relative group flex-1 min-h-[480px] flex items-center justify-center overflow-hidden bg-gray-50 rounded-lg w-full">
            {selectedPoses.length === 1 ? (
              <>
                <img
                  src={selectedPoses[0].image}
                  alt={selectedPoses[0].name}
                  className="max-h-[480px] w-auto object-contain cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setActiveCategory('poses')}
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="bg-black/80 text-white px-4 py-2 rounded-lg text-sm font-medium">
                    Change Pose
                  </div>
                </div>
              </>
            ) : selectedPoses.length > 1 ? (
              <div
                className="grid grid-cols-2 gap-2 cursor-pointer h-full p-4"
                onClick={() => setActiveCategory('poses')}
              >
                {selectedPoses.slice(0, 4).map((pose, idx) => (
                  <div key={pose.id} className="relative">
                    <img
                      src={pose.image}
                      alt={pose.name}
                      className="h-full object-contain bg-white rounded-lg border border-gray-200 p-2"
                    />
                    {idx === 3 && selectedPoses.length > 4 && (
                      <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                        <span className="text-white font-medium text-lg">+{selectedPoses.length - 4} more</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="w-full h-full bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-200"
                onClick={() => setActiveCategory('poses')}
              >
                <span className="text-gray-500">Select Poses</span>
              </div>
            )}
          </div>
        </div>

        {/* Settings column */}
        <div className="flex flex-col gap-4 justify-center">
          {/* Character */}
          <div>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
              Character
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <SlotButton
                onClick={() => setActiveCategory('model')}
                imageUrl={currentModel?.thumbnailUrl || currentModel?.faceUrl}
                label={currentModel?.name || 'Model'}
                placeholder="Model"
                imageClassName="object-cover object-top"
              />
              <button
                onClick={() => setGazeDirection(gazeDirection === 'candid' ? 'staring' : 'candid')}
                className="w-20 h-20 lg:w-24 lg:h-24 border-2 rounded-lg shadow-sm flex flex-col items-center justify-center bg-white border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50 cursor-pointer"
              >
                <span className="text-xs font-medium">{gazeDirection === 'candid' ? 'Candid' : 'Camera'}</span>
                <span className="text-[10px] font-medium capitalize text-gray-500">{gazeDirection}</span>
              </button>
              <button
                onClick={() => setSmileExpression(smileExpression === 'smiling' ? 'serious' : 'smiling')}
                className="w-20 h-20 lg:w-24 lg:h-24 border-2 rounded-lg shadow-sm flex flex-col items-center justify-center bg-white border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50 cursor-pointer"
              >
                <span className="text-xs font-medium">{smileExpression === 'smiling' ? 'Smile' : 'Serious'}</span>
                <span className="text-[10px] font-medium capitalize text-gray-500">{smileExpression}</span>
              </button>
            </div>
          </div>

          {/* Outfit */}
          <div>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Outfit</span>
            <div className="grid grid-cols-3 gap-1.5">
              <SlotButton
                onClick={() => setActiveCategory('tops')}
                imageUrl={topsItem?.thumbnailUrl}
                label={topsItem?.name || 'Top'}
                placeholder="Top"
              />
              <SlotButton
                onClick={() => setActiveCategory('bottoms')}
                imageUrl={bottomsItem?.thumbnailUrl}
                label={bottomsItem?.name || 'Bottom'}
                placeholder="Bottom"
              />
              <SlotButton
                onClick={() => setActiveCategory('shoes')}
                imageUrl={shoesItem?.thumbnailUrl}
                label={shoesItem?.name || 'Shoes'}
                placeholder="Shoes"
              />
            </div>
          </div>

          {/* Scene */}
          <div>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Scene</span>
            <div className="grid grid-cols-3 gap-1.5">
              <SlotButton
                onClick={() => setActiveCategory('location')}
                imageUrl={currentLocation?.thumbnailUrl}
                label={currentLocation?.name || 'Location'}
                placeholder="Location"
              />
              <SlotButton
                onClick={() => setActiveCategory('scene_style')}
                imageUrl={currentSceneStyle?.thumbnailUrl}
                label={currentSceneStyle?.name || 'Style'}
                placeholder="Style"
              />
              <div className="w-20 h-20 lg:w-24 lg:h-24" />
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={
              isGenerating || !selectedModel || selectedPoses.length === 0 || !selectedLocation
            }
            className="w-full mt-4"
          >
            {isGenerating ? 'Generating…' : 'Generate Image'}
          </Button>
        </div>
      </div>

      <SelectionModal
        isOpen={activeCategory !== null}
        onClose={() => setActiveCategory(null)}
        category={activeCategory}
        onSelectGarment={handleSelectGarment}
        selectedItem={
          activeCategory === 'shoes' || activeCategory === 'tops' || activeCategory === 'bottoms'
            ? selectedProducts[activeCategory]
            : undefined
        }
        selectedPoses={selectedPoses.map((p) => p.id)}
        onPosesSelect={(poses) => setSelectedPoses(poses)}
        onModelSelect={(id) => setSelectedModel(id)}
        selectedModel={selectedModel}
        onLocationSelect={(id) => setSelectedLocation(id)}
        selectedLocation={selectedLocation}
        onSceneStyleSelect={(id) => setSelectedSceneStyle(id)}
        selectedSceneStyle={selectedSceneStyle}
      />
    </div>
  )
}

interface SlotButtonProps {
  onClick: () => void
  imageUrl?: string
  label: string
  placeholder: string
  imageClassName?: string
}

const SlotButton: React.FC<SlotButtonProps> = ({ onClick, imageUrl, label, placeholder, imageClassName }) => {
  if (imageUrl) {
    return (
      <button
        onClick={onClick}
        className="w-20 h-20 lg:w-24 lg:h-24 bg-white border-2 border-gray-300 rounded-lg p-1.5 shadow-sm overflow-hidden hover:border-gray-400 hover:shadow-md transition-all cursor-pointer"
        title={label}
      >
        <OptimizedImage
          src={imageUrl}
          alt={label}
          className={cn('w-full h-full object-contain', imageClassName)}
        />
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className="w-20 h-20 lg:w-24 lg:h-24 bg-gray-50 border-2 border-gray-200 rounded-lg flex items-center justify-center hover:border-gray-400 hover:bg-gray-100 transition-all cursor-pointer"
    >
      <span className="text-[10px] text-gray-400">{placeholder}</span>
    </button>
  )
}

export default LifestyleGen
