// Ported verbatim from bball repo (src/components/editor/ChipButtons.tsx).
import React from 'react'
import { Button } from '@/components/ui/button'
import { ArrowUp, Paintbrush2, RectangleHorizontal, RectangleVertical, Shirt } from 'lucide-react'

interface ChipButtonsProps {
  onChipClick: (prompt: string, aspectRatio: string) => void
  onUpscaleClick?: () => void
  onFixClothingClick?: () => void
  onMaskAndFixClick?: () => void
  disabled?: boolean
}

const ChipButtons: React.FC<ChipButtonsProps> = ({
  onChipClick,
  onUpscaleClick,
  onFixClothingClick,
  onMaskAndFixClick,
  disabled = false,
}) => {
  const handleResizeToPortrait = () => {
    onChipClick(
      'Extend the canvas to 9:16 by adding natural background at top and bottom, matching the original style, lighting, and color. Do not modify the existing central content.',
      '9:16',
    )
  }

  const handleResizeToLandscape = () => {
    onChipClick(
      'Extend the canvas to 16:9 by adding natural background at left and right, matching the original style, lighting, and color. Do not modify the existing central content.',
      '16:9',
    )
  }

  return (
    <div className="flex gap-2 mb-3">
      <Button
        variant="outline"
        size="sm"
        onClick={handleResizeToPortrait}
        disabled={disabled}
        className="flex items-center gap-2 h-8 px-3 text-xs"
      >
        <RectangleVertical className="h-3 w-3" />
        9:16
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleResizeToLandscape}
        disabled={disabled}
        className="flex items-center gap-2 h-8 px-3 text-xs"
      >
        <RectangleHorizontal className="h-3 w-3" />
        16:9
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onFixClothingClick}
        disabled={disabled || !onFixClothingClick}
        className="flex items-center gap-2 h-8 px-3 text-xs"
      >
        <Shirt className="h-3 w-3" />
        Product Swap
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onMaskAndFixClick}
        disabled={disabled || !onMaskAndFixClick}
        className="flex items-center gap-2 h-8 px-3 text-xs"
      >
        <Paintbrush2 className="h-3 w-3" />
        Precise Product Swap
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onUpscaleClick}
        disabled={disabled || !onUpscaleClick}
        className="flex items-center gap-2 h-8 px-3 text-xs"
      >
        <ArrowUp className="h-3 w-3" />
        Upscale
      </Button>
    </div>
  )
}

export default ChipButtons
