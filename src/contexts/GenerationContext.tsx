import React, { createContext, useContext, useState, type ReactNode } from 'react'

interface GenerationContextType {
  currentGenerationId: string | null
  currentPoseCount: number
  startGeneration: (generationId: string, poseCount?: number) => void
  completeGeneration: () => void
  dismissProgress: () => void
}

const GenerationContext = createContext<GenerationContextType | undefined>(undefined)

export const useGeneration = () => {
  const ctx = useContext(GenerationContext)
  if (!ctx) throw new Error('useGeneration must be used within a GenerationProvider')
  return ctx
}

export const GenerationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentGenerationId, setCurrentGenerationId] = useState<string | null>(null)
  const [currentPoseCount, setCurrentPoseCount] = useState<number>(1)

  return (
    <GenerationContext.Provider
      value={{
        currentGenerationId,
        currentPoseCount,
        startGeneration: (id, count = 1) => {
          setCurrentGenerationId(id)
          setCurrentPoseCount(count)
        },
        completeGeneration: () => {
          setCurrentGenerationId(null)
          setCurrentPoseCount(1)
        },
        dismissProgress: () => {
          setCurrentGenerationId(null)
          setCurrentPoseCount(1)
        },
      }}
    >
      {children}
    </GenerationContext.Provider>
  )
}
