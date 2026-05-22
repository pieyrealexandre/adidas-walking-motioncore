// Adapted from bball repo (src/pages/GroupShotPage.tsx).
//
// Deltas vs bball:
//   - Locations: read from src/running-japan/references.ts (running-japan
//     locations). Default location is the first one in the catalog.
//   - GROUP_POSES: labels + descriptions rewritten for running. The pose
//     IDs are kept as bball's slugs because `generate-group-shot` (the
//     Edge Function) has hardcoded interpretation per slug. Updating the
//     Edge Function to know running poses is a follow-up that lives in
//     the bball repo. Until then, the UI says "Group Run" but the server
//     will still treat the slug as 'playing_basketball'.
//   - Garment lookups go through running-japan PRODUCTS_BY_ID.
//   - After every successful generation the new asset row is tagged with
//     category = 'running-japan'.

import { useEffect, useState } from 'react'
import { ArrowLeft, Shirt, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { useAssetContext } from '@/contexts/AssetContext'
import { CATEGORY_SLUG, STORAGE_KEYS } from '@/walking-motioncore'
import { LOCATIONS, LOCATIONS_BY_ID } from '@/walking-motioncore/references'
import { PRODUCTS_BY_ID } from '@/walking-motioncore/garments'
import { getModelById, type ModelId } from '@/components/image-creation/ModelSelector'
import { SelectionModal, type LocationId } from '@/components/image-creation/SelectionModal'
import { OptimizedImage } from '@/components/image-creation/OptimizedImage'
import type { ProductCategory } from '@/components/image-creation/ProductPicker'

// Group pose options — labels are running-themed, IDs match what the bball
// `generate-group-shot` Edge Function knows about. Swap labels and IDs
// together once the Edge Function is updated.
const GROUP_POSES = [
  { id: 'laughing_bench' as const, label: 'Cool-Down Talk', description: 'Sitting together after a run, talking and laughing' },
  { id: 'playing_basketball' as const, label: 'Group Run', description: 'Running side-by-side, dynamic motion' },
  { id: 'casual_conversation' as const, label: 'Pre-Race Chat', description: 'Natural conversation, cinematic feel' },
  { id: 'one_on_one_defense' as const, label: 'Stretching Together', description: 'Warming up before a run' },
] as const

type GroupPoseId = (typeof GROUP_POSES)[number]['id']

const DEFAULT_LOCATION: LocationId = LOCATIONS[0]?.id || 'tokyo_marathon_street'

const GroupShotPage = () => {
  const navigate = useNavigate()
  const { refreshAssets } = useAssetContext()
  const [isGenerating, setIsGenerating] = useState(false)

  const [char1Model, setChar1Model] = useState<ModelId | null>(null)
  const [char1Products, setChar1Products] = useState<{ tops?: string; bottoms?: string; shoes?: string }>({})
  const [char2Model, setChar2Model] = useState<ModelId | null>(null)
  const [char2Products, setChar2Products] = useState<{ tops?: string; bottoms?: string; shoes?: string }>({})

  const [selectedLocation, setSelectedLocation] = useState<LocationId>(DEFAULT_LOCATION)
  const [selectedGroupPoses, setSelectedGroupPoses] = useState<GroupPoseId[]>([])
  const crowdEnabled = true

  const [activeCategory, setActiveCategory] = useState<ProductCategory | null>(null)
  const [selectingForChar, setSelectingForChar] = useState<1 | 2>(1)

  const [lastGenerationPayload, setLastGenerationPayload] = useState<any | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.lastGroupShotGeneration)
    if (stored) {
      try {
        setLastGenerationPayload(JSON.parse(stored))
      } catch {
        localStorage.removeItem(STORAGE_KEYS.lastGroupShotGeneration)
      }
    }
  }, [])

  const char1Data = char1Model ? getModelById(char1Model) : undefined
  const char2Data = char2Model ? getModelById(char2Model) : undefined

  const canGenerate = Boolean(
    char1Model &&
      char2Model &&
      char1Products.tops &&
      char2Products.tops &&
      char1Products.bottoms &&
      char2Products.bottoms &&
      selectedGroupPoses.length > 0,
  )

  const handleOpenGarmentModal = (charNum: 1 | 2, category: ProductCategory) => {
    setSelectingForChar(charNum)
    setActiveCategory(category)
  }

  const handleModalClose = () => setActiveCategory(null)

  const handleModelSelect = (modelId: ModelId) => {
    if (selectingForChar === 1) {
      setChar1Model(modelId)
      if (char2Model === modelId) setChar2Model(null)
    } else {
      setChar2Model(modelId)
    }
  }

  const handleLocationSelect = (locationId: LocationId) => setSelectedLocation(locationId)

  const handleSelectGarment = (slot: 'tops' | 'bottoms' | 'shoes', itemId: string) => {
    if (selectingForChar === 1) {
      setChar1Products((prev) => ({ ...prev, [slot]: itemId }))
    } else {
      setChar2Products((prev) => ({ ...prev, [slot]: itemId }))
    }
    setActiveCategory(null)
  }

  const toggleGroupPose = (poseId: GroupPoseId) => {
    setSelectedGroupPoses((prev) => (prev.includes(poseId) ? [] : [poseId]))
  }

  const buildPayload = (pose: GroupPoseId) => {
    const char1Tops = char1Products.tops ? PRODUCTS_BY_ID[char1Products.tops] : undefined
    const char2Tops = char2Products.tops ? PRODUCTS_BY_ID[char2Products.tops] : undefined
    const char1Bottoms = char1Products.bottoms ? PRODUCTS_BY_ID[char1Products.bottoms] : undefined
    const char2Bottoms = char2Products.bottoms ? PRODUCTS_BY_ID[char2Products.bottoms] : undefined

    return {
      character1Gender: char1Data!.gender,
      character2Gender: char2Data!.gender,
      character1SkinTone: char1Data!.skinTone,
      character2SkinTone: char2Data!.skinTone,
      character1Images: char1Tops ? [char1Tops.payloadUrl] : [],
      character2Images: char2Tops ? [char2Tops.payloadUrl] : [],
      character1TopName: char1Tops?.name,
      character2TopName: char2Tops?.name,
      character1BottomsImage: char1Bottoms?.payloadUrl,
      character1BottomsName: char1Bottoms?.name,
      character2BottomsImage: char2Bottoms?.payloadUrl,
      character2BottomsName: char2Bottoms?.name,
      character1FaceUrl: char1Data!.faceUrl,
      character2FaceUrl: char2Data!.faceUrl,
      location: selectedLocation,
      pose,
      crowdEnabled,
      numImages: 4,
      aspect_ratio: '1:1',
      category: CATEGORY_SLUG,
    }
  }

  const tagAssetCategory = async (assetId: string) => {
    await supabase.from('assets').update({ category: CATEGORY_SLUG }).eq('id', assetId)
  }

  const handleGenerateOne = async (pose: GroupPoseId) => {
    const payload = buildPayload(pose)
    localStorage.setItem(STORAGE_KEYS.lastGroupShotGeneration, JSON.stringify(payload))
    setLastGenerationPayload(payload)

    const response = await supabase.functions.invoke('generate-group-shot', { body: payload })
    if (response.error) {
      toast.error(`Failed to generate group shot (${pose})`)
      return
    }
    if (response.data?.assetId) {
      await tagAssetCategory(response.data.assetId)
    } else {
      toast.error('Unexpected response from server')
    }
  }

  const handleGenerate = async () => {
    if (!canGenerate) return
    setIsGenerating(true)
    try {
      for (const pose of selectedGroupPoses) {
        await handleGenerateOne(pose)
      }
      navigate('/gallery')
      setTimeout(() => refreshAssets(), 200)
      toast.success(
        `${selectedGroupPoses.length} group shot generation${selectedGroupPoses.length > 1 ? 's' : ''} started!`,
      )
    } catch {
      toast.error('Failed to start group shot generation')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRerunLastGeneration = async () => {
    if (!lastGenerationPayload) return
    setIsGenerating(true)
    try {
      const response = await supabase.functions.invoke('generate-group-shot', {
        body: lastGenerationPayload,
      })
      if (response.error) {
        toast.error('Failed to re-run generation')
        return
      }
      if (response.data?.assetId) {
        await tagAssetCategory(response.data.assetId)
        navigate('/gallery')
        setTimeout(() => refreshAssets(), 200)
        toast.success('Group shot generation started!')
      } else {
        toast.error('Unexpected response from server')
      }
    } catch {
      toast.error('Failed to re-run generation. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const renderCharacterColumn = (
    charNum: 1 | 2,
    model: ModelId | null,
    modelData: ReturnType<typeof getModelById>,
    products: { tops?: string; bottoms?: string },
    onModelClick: () => void,
  ) => {
    const topsItem = products.tops ? PRODUCTS_BY_ID[products.tops] : undefined
    const bottomsItem = products.bottoms ? PRODUCTS_BY_ID[products.bottoms] : undefined
    return (
      <div className="flex flex-col items-center gap-4 w-[220px] h-full">
        <button
          onClick={onModelClick}
          className={cn(
            'group relative w-full h-[180px] rounded-xl border-2 transition-all duration-200',
            'flex flex-col items-center justify-center',
            'bg-white overflow-hidden cursor-pointer',
            model ? 'border-black' : 'border-gray-200 hover:border-black',
          )}
        >
          {modelData ? (
            <div className="w-full h-full rounded-md overflow-hidden">
              <OptimizedImage
                src={modelData.thumbnailUrl || modelData.faceUrl}
                alt={modelData.name}
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <User className="h-10 w-10 text-gray-400" />
              <span className="text-sm font-medium text-gray-500">Select Model</span>
            </div>
          )}
        </button>

        <div className="flex flex-col gap-3 w-full">
          <GarmentButton
            label="Top"
            name={topsItem?.name}
            thumbnail={topsItem?.thumbnailUrl}
            onClick={() => handleOpenGarmentModal(charNum, 'tops')}
          />
          <GarmentButton
            label="Bottoms"
            name={bottomsItem?.name}
            thumbnail={bottomsItem?.thumbnailUrl}
            onClick={() => handleOpenGarmentModal(charNum, 'bottoms')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/image-creation')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-semibold text-gray-900">Group Shot Creator</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center overflow-auto">
        <div className="flex items-stretch justify-center">
          <div className="flex flex-col px-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 text-center">
              Define Overall Scene
            </h2>
            <div className="flex flex-col items-center min-w-[380px] max-w-[460px] h-full">
              <div className="grid grid-cols-2 gap-3 w-full flex-1">
                {GROUP_POSES.map((pose) => (
                  <button
                    key={pose.id}
                    onClick={() => toggleGroupPose(pose.id)}
                    className={cn(
                      'group relative rounded-xl border-2 transition-all duration-200 p-4 min-h-[100px]',
                      'bg-white cursor-pointer text-left',
                      selectedGroupPoses.includes(pose.id)
                        ? 'border-black'
                        : 'border-gray-200 hover:border-black',
                    )}
                  >
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">{pose.label}</h4>
                    <p className="text-xs text-gray-500">{pose.description}</p>
                    {selectedGroupPoses.includes(pose.id) && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-black rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setActiveCategory('location')}
                className="w-full mt-4 bg-white border-2 border-gray-300 rounded-xl shadow-sm flex items-center gap-4 hover:border-gray-400 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden p-3"
              >
                <div className="w-28 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                  {LOCATIONS_BY_ID[selectedLocation]?.thumbnailUrl && (
                    <OptimizedImage
                      src={LOCATIONS_BY_ID[selectedLocation].thumbnailUrl}
                      alt={selectedLocation}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Location</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {LOCATIONS_BY_ID[selectedLocation]?.name || 'Select Location'}
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div className="w-px bg-gray-200 self-stretch" />

          <div className="flex flex-col px-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 text-center">
              Define Character 1
            </h2>
            {renderCharacterColumn(1, char1Model, char1Data, char1Products, () => {
              setSelectingForChar(1)
              setActiveCategory('model')
            })}
          </div>

          <div className="w-px bg-gray-200 self-stretch" />

          <div className="flex flex-col px-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 text-center">
              Define Character 2
            </h2>
            {renderCharacterColumn(2, char2Model, char2Data, char2Products, () => {
              setSelectingForChar(2)
              setActiveCategory('model')
            })}
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 mt-[6vh]">
          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            className={cn(
              'px-8 font-medium transition-colors',
              canGenerate && !isGenerating
                ? 'bg-black text-white hover:bg-gray-800'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            )}
            size="lg"
          >
            {isGenerating
              ? 'Generating...'
              : `Generate ${selectedGroupPoses.length || ''} Group Image${selectedGroupPoses.length !== 1 ? 's' : ''}`}
          </Button>
          {lastGenerationPayload && (
            <Button variant="outline" size="sm" disabled={isGenerating} onClick={handleRerunLastGeneration}>
              Re-run Last Generation
            </Button>
          )}
        </div>
      </div>

      <SelectionModal
        isOpen={activeCategory !== null}
        onClose={handleModalClose}
        category={activeCategory}
        onSelectGarment={handleSelectGarment}
        selectedItem={
          activeCategory === 'tops' || activeCategory === 'bottoms' || activeCategory === 'shoes'
            ? selectingForChar === 1
              ? char1Products[activeCategory]
              : char2Products[activeCategory]
            : undefined
        }
        selectedPoses={[]}
        onPosesSelect={() => {}}
        onModelSelect={handleModelSelect}
        selectedModel={selectingForChar === 1 ? char1Model : char2Model}
        onLocationSelect={handleLocationSelect}
        selectedLocation={selectedLocation}
      />
    </div>
  )
}

const GarmentButton = ({
  label,
  name,
  thumbnail,
  onClick,
}: {
  label: string
  name?: string
  thumbnail?: string
  onClick: () => void
}) => (
  <button
    onClick={onClick}
    className={cn(
      'group relative h-20 rounded-xl border-2 transition-all duration-200',
      'flex items-center gap-3 p-3',
      'bg-white cursor-pointer overflow-hidden w-full',
      name ? 'border-black' : 'border-gray-200 hover:border-black',
    )}
  >
    {thumbnail ? (
      <>
        <div className="h-full aspect-square rounded overflow-hidden bg-gray-50 flex items-center justify-center flex-shrink-0">
          <OptimizedImage
            src={thumbnail}
            alt={name || label}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
          />
        </div>
        <span className="text-sm font-medium text-gray-900 line-clamp-2">{name}</span>
      </>
    ) : (
      <div className="flex items-center gap-3">
        <div className="h-14 aspect-square rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Shirt className="h-5 w-5 text-gray-400" />
        </div>
        <span className="text-sm font-medium text-gray-500">Select {label}</span>
      </div>
    )}
  </button>
)

export default GroupShotPage
