// Adapted from bball repo (src/pages/ImageCreation.tsx).
//
// Delta vs bball:
//   - Hero imagery is placeholder text until running-japan content lands.
//     bball pulls campaign hero photos from sagastudios-gnutts; we'd want
//     equivalents from saga-running-japan-images-eu but those haven't been
//     shot yet.
//   - Routes: /image-creation/product, /image-creation/lifestyle,
//     /image-creation/group (group route changed from bball's /group-shot
//     for symmetry with the other image-creation modes).

import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'

const cards = [
  { label: 'Product Images', href: '/image-creation/product' },
  { label: 'Lifestyle Images', href: '/image-creation/lifestyle' },
  { label: 'Group Shots', href: '/image-creation/group' },
]

const ImageCreation = () => {
  const navigate = useNavigate()

  return (
    <div className="h-full flex items-center justify-center bg-white p-8">
      <div className="max-w-6xl w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {cards.map((card) => (
            <div
              key={card.href}
              className="group relative bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer"
            >
              <div onClick={() => navigate(card.href)} className="relative flex flex-col h-[500px]">
                <div className="flex-1 overflow-hidden bg-gray-100 flex items-center justify-center">
                  <span className="text-gray-400 text-sm">{card.label} hero — TBD (content)</span>
                </div>
                <div className="p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4 text-center">{card.label}</h2>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(card.href)
                    }}
                    className="w-full"
                  >
                    Create
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ImageCreation
