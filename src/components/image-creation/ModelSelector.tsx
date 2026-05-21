import React from 'react'
import { cn } from '@/lib/utils'
import { User } from 'lucide-react'
import { MODELS, MODELS_BY_ID, MODELS_BY_GENDER, type RunningModel } from '@/running-japan/references'

export type ModelId = string
export type ModelOption = RunningModel

export const getModelById = (id: ModelId): ModelOption | undefined => MODELS_BY_ID[id]

export const getModelsByGender = (gender: 'male' | 'female'): ModelOption[] =>
  MODELS_BY_GENDER[gender]

export const getDefaultModelForGender = (gender: 'male' | 'female'): ModelOption | undefined => {
  const list = getModelsByGender(gender)
  return list[0]
}

export const ALL_MODELS = MODELS

interface ModelSelectorProps {
  selectedModel: ModelId | null
  onOpen: () => void
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onOpen }) => {
  const currentModel = selectedModel ? getModelById(selectedModel) : undefined

  return (
    <button
      onClick={onOpen}
      className={cn(
        'relative w-full aspect-[2/1] md:aspect-square rounded-lg border-2 transition-all duration-200',
        'flex flex-col items-center justify-center gap-2 p-4',
        'bg-white hover:bg-gray-50 border-gray-200 cursor-pointer',
        currentModel && 'ring-2 ring-offset-2 ring-black',
      )}
    >
      <div className="text-gray-700">
        <User className="w-8 h-8" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-gray-900">Model</p>
        {currentModel ? (
          <p className="text-xs text-gray-600 mt-1 truncate max-w-[150px]">{currentModel.name}</p>
        ) : (
          <p className="text-xs text-gray-400 mt-1">Pick a model</p>
        )}
      </div>
      {currentModel && (
        <div className="absolute top-2 right-2 w-5 h-5 bg-black rounded-full flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  )
}
