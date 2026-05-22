import React, { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OptimizedImage } from './OptimizedImage'
import type { ProductCategory } from './ProductPicker'
import type { ModelId } from './ModelSelector'
import { MODELS_BY_GENDER } from '@/walking-motioncore/references'
import { POSES } from '@/walking-motioncore/poses'
import { SHOES, TOPS, BOTTOMS } from '@/walking-motioncore/garments'
import { LOCATIONS, SCENE_STYLES } from '@/walking-motioncore/references'

export type LocationId = string
export type SceneStyleId = string

interface SelectionModalProps {
  isOpen: boolean
  onClose: () => void
  category: ProductCategory | null
  onSelectGarment?: (slot: 'tops' | 'bottoms' | 'shoes', itemId: string) => void
  selectedItem?: string
  selectedPoses?: string[]
  onPosesSelect?: (poses: Array<{ id: string; name: string; image: string }>) => void
  onModelSelect?: (modelId: ModelId) => void
  selectedModel?: ModelId | null
  onLocationSelect?: (locationId: LocationId) => void
  selectedLocation?: LocationId | null
  onSceneStyleSelect?: (styleId: SceneStyleId) => void
  selectedSceneStyle?: SceneStyleId | null
}

interface CatalogItem {
  id: string
  name: string
  image: string
  description?: string
}

const titles: Record<ProductCategory, string> = {
  shoes: 'Select Shoes',
  tops: 'Select Top',
  bottoms: 'Select Bottom',
  poses: 'Select Poses',
  model: 'Select Model',
  location: 'Select Location',
  scene_style: 'Select Scene Style',
}

function itemsForCategory(category: ProductCategory): CatalogItem[] {
  switch (category) {
    case 'shoes':
      return SHOES.map((p) => ({ id: p.id, name: p.name, image: p.thumbnailUrl }))
    case 'tops':
      return TOPS.map((p) => ({ id: p.id, name: p.name, image: p.thumbnailUrl }))
    case 'bottoms':
      return BOTTOMS.map((p) => ({ id: p.id, name: p.name, image: p.thumbnailUrl }))
    case 'poses':
      return POSES.map((p) => ({ id: p.id, name: p.name, image: p.image, description: p.description }))
    case 'location':
      return LOCATIONS.map((l) => ({ id: l.id, name: l.name, image: l.thumbnailUrl }))
    case 'scene_style':
      return SCENE_STYLES.map((s) => ({ id: s.id, name: s.name, image: s.thumbnailUrl }))
    case 'model':
      return [] // handled separately so we can group by gender
  }
}

export const SelectionModal: React.FC<SelectionModalProps> = ({
  isOpen,
  onClose,
  category,
  onSelectGarment,
  selectedItem,
  selectedPoses = [],
  onPosesSelect,
  onModelSelect,
  selectedModel,
  onLocationSelect,
  selectedLocation,
  onSceneStyleSelect,
  selectedSceneStyle,
}) => {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [tempSelectedPoses, setTempSelectedPoses] = useState<
    Array<{ id: string; name: string; image: string }>
  >([])

  const items = useMemo(() => (category ? itemsForCategory(category) : []), [category])

  useEffect(() => {
    if (category === 'poses' && isOpen) {
      setTempSelectedPoses(
        selectedPoses
          .map((poseId) => {
            const p = POSES.find((pp) => pp.id === poseId)
            return p ? { id: p.id, name: p.name, image: p.image } : null
          })
          .filter(Boolean) as Array<{ id: string; name: string; image: string }>,
      )
    }
  }, [category, isOpen, selectedPoses])

  if (!isOpen || !category) return null

  const handleItemClick = (item: CatalogItem) => {
    if (category === 'poses') {
      const existing = tempSelectedPoses.findIndex((p) => p.id === item.id)
      if (existing >= 0) {
        setTempSelectedPoses([])
      } else {
        setTempSelectedPoses([{ id: item.id, name: item.name, image: item.image }])
      }
      return
    }

    if (category === 'model' && onModelSelect) {
      onModelSelect(item.id)
    } else if (category === 'location' && onLocationSelect) {
      onLocationSelect(item.id)
    } else if (category === 'scene_style' && onSceneStyleSelect) {
      onSceneStyleSelect(item.id)
    } else if ((category === 'shoes' || category === 'tops' || category === 'bottoms') && onSelectGarment) {
      onSelectGarment(category, item.id)
    }
    onClose()
  }

  const handlePosesDone = () => {
    if (onPosesSelect) onPosesSelect(tempSelectedPoses)
    onClose()
  }

  const isItemSelected = (id: string): boolean => {
    if (category === 'poses') return tempSelectedPoses.some((p) => p.id === id)
    if (category === 'model') return selectedModel === id
    if (category === 'location') return selectedLocation === id
    if (category === 'scene_style') return selectedSceneStyle === id
    return selectedItem === id
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col',
          'transform transition-transform duration-300 ease-out translate-x-0',
        )}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            {titles[category]}
            {category === 'poses' && tempSelectedPoses.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-600">
                ({tempSelectedPoses.length} selected)
              </span>
            )}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {category === 'model' ? (
            <div className="flex flex-col gap-6">
              {[
                { label: 'Female', models: MODELS_BY_GENDER.female },
                { label: 'Male', models: MODELS_BY_GENDER.male },
              ].map(({ label, models }) => (
                <div key={label}>
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                    {label}
                  </h4>
                  <div className="flex flex-col gap-3">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => handleItemClick({ id: m.id, name: m.name, image: m.thumbnailUrl || m.faceUrl })}
                        onMouseEnter={() => setHoveredItem(m.id)}
                        onMouseLeave={() => setHoveredItem(null)}
                        className={cn(
                          'relative w-full h-28 rounded-lg border-2 transition-all duration-200',
                          'flex items-center gap-4 p-4',
                          'bg-gray-50 hover:bg-gray-100 border-gray-200',
                          selectedModel === m.id && 'border-black bg-gray-100',
                          hoveredItem === m.id && 'shadow-md -translate-x-1',
                        )}
                      >
                        <div className="w-20 h-20 bg-gray-200 rounded-md overflow-hidden flex-shrink-0">
                          <OptimizedImage
                            src={m.thumbnailUrl || m.faceUrl}
                            alt={m.name}
                            className="w-full h-full object-cover object-top"
                          />
                        </div>
                        <div className="flex-grow text-left">
                          <p className="text-sm font-medium text-gray-900">{m.name}</p>
                          {m.skinTone && (
                            <p className="text-xs text-gray-500 mt-0.5">{m.skinTone}</p>
                          )}
                        </div>
                        {selectedModel === m.id && (
                          <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center flex-shrink-0">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((item) => {
                const isSelected = isItemSelected(item.id)
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={cn(
                      'relative w-full h-28 rounded-lg border-2 transition-all duration-200',
                      'flex items-center gap-4 p-4',
                      'bg-gray-50 hover:bg-gray-100 border-gray-200',
                      isSelected && 'border-black bg-gray-100',
                      hoveredItem === item.id && 'shadow-md -translate-x-1',
                    )}
                  >
                    <div className="w-20 h-20 bg-gray-200 rounded-md overflow-hidden flex-shrink-0">
                      <OptimizedImage src={item.image} alt={item.name} className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-grow text-left">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {category === 'poses' && (
          <div className="p-6 bg-white border-t">
            <Button
              onClick={handlePosesDone}
              disabled={tempSelectedPoses.length === 0}
              className="w-full"
            >
              Done {tempSelectedPoses.length > 0 && `(${tempSelectedPoses.length} selected)`}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
