// Adapted from bball repo (src/components/editor/GarmentSelectionModal.tsx).
//
// Delta vs bball: source data swap.
//   bball reads from `mockProducts` in image-creation/SelectionModal (the
//   basketball garment catalog). adiGen reads from the running-japan catalog
//   (SHOES + TOPS + BOTTOMS in src/running-japan/garments.ts).
//
// Visual + interaction layer is verbatim.

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { SHOES, TOPS, BOTTOMS } from '@/walking-motioncore/garments'

interface GarmentItem {
  id: string
  name: string
  imageUrl: string
  category: 'tops' | 'bottoms' | 'shoes'
}

interface GarmentSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (item: GarmentItem) => void
}

type GarmentCategory = 'tops' | 'bottoms' | 'shoes'

function buildGarmentItems(): GarmentItem[] {
  const items: GarmentItem[] = []
  for (const t of TOPS) items.push({ id: t.id, name: t.name, imageUrl: t.thumbnailUrl || t.payloadUrl, category: 'tops' })
  for (const b of BOTTOMS) items.push({ id: b.id, name: b.name, imageUrl: b.thumbnailUrl || b.payloadUrl, category: 'bottoms' })
  for (const s of SHOES) items.push({ id: s.id, name: s.name, imageUrl: s.thumbnailUrl || s.payloadUrl, category: 'shoes' })
  return items
}

export const GarmentSelectionModal: React.FC<GarmentSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | GarmentCategory>('all')
  const [selectedItem, setSelectedItem] = useState<GarmentItem | null>(null)

  const garmentItems = useMemo(() => buildGarmentItems(), [])
  const filteredItems =
    selectedCategory === 'all' ? garmentItems : garmentItems.filter((i) => i.category === selectedCategory)

  const handleSelect = (item: GarmentItem) => setSelectedItem(item)

  const handleConfirm = () => {
    if (selectedItem) {
      onSelect(selectedItem)
      onClose()
      setSelectedItem(null)
      setSelectedCategory('all')
    }
  }

  const handleClose = () => {
    onClose()
    setSelectedItem(null)
    setSelectedCategory('all')
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Garment to Fix</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 pb-4 border-b">
          {(['all', 'tops', 'bottoms', 'shoes'] as const).map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Button>
          ))}
        </div>
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-3 gap-4 p-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelect(item)}
                className={cn(
                  'cursor-pointer border-2 rounded-lg p-2 transition-all',
                  selectedItem?.id === item.id
                    ? 'border-primary bg-primary/10'
                    : 'border-gray-200 hover:border-gray-400',
                )}
              >
                <div className="aspect-square bg-gray-50 rounded-md overflow-hidden mb-2">
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                </div>
                <p className="text-sm font-medium text-center">{item.name}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedItem}>
            Apply Fix
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
