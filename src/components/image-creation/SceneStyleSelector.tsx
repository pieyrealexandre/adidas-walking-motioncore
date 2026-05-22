import React from 'react'
import { cn } from '@/lib/utils'
import { Palette } from 'lucide-react'
import { SCENE_STYLES_BY_ID } from '@/walking-motioncore/references'

export type SceneStyle = string

interface SceneStyleSelectorProps {
  selectedStyle: SceneStyle
  onOpen: () => void
}

export const SceneStyleSelector: React.FC<SceneStyleSelectorProps> = ({ selectedStyle, onOpen }) => {
  const currentStyle = SCENE_STYLES_BY_ID[selectedStyle]

  return (
    <button
      onClick={onOpen}
      className={cn(
        'relative w-full aspect-[2/1] md:aspect-square rounded-lg border-2 transition-all duration-200',
        'flex flex-col items-center justify-center gap-2 p-4',
        'bg-white hover:bg-gray-50 border-gray-200 ring-2 ring-offset-2 ring-black',
      )}
    >
      <div className="text-gray-700">
        <Palette className="w-8 h-8" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-gray-900">Scene Style</p>
        {currentStyle && (
          <p className="text-xs text-gray-600 mt-1 truncate max-w-[150px]">{currentStyle.name}</p>
        )}
      </div>
      <div className="absolute top-2 right-2 w-5 h-5 bg-black rounded-full flex items-center justify-center">
        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    </button>
  )
}
