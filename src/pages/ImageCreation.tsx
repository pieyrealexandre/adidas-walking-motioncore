// Adapted from bball repo (src/pages/ImageCreation.tsx).
//
// Deltas vs bball:
//   - Only the Lifestyle card is rendered. Product Images and Group Shots are
//     out of v1 scope; add them when the pages exist.
//   - bball uses a hero image from sagastudios-gnutts; the running-japan
//     equivalent isn't shot yet — placeholder background until content lands.

import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'

const ImageCreation = () => {
  const navigate = useNavigate()

  return (
    <div className="h-full flex items-center justify-center bg-white p-8">
      <div className="max-w-6xl w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="group relative bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer">
            <div
              onClick={() => navigate('/image-creation/lifestyle')}
              className="relative flex flex-col h-[500px]"
            >
              <div className="flex-1 overflow-hidden bg-gray-100 flex items-center justify-center">
                <span className="text-gray-400 text-sm">Lifestyle hero — TBD (content)</span>
              </div>
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4 text-center">Lifestyle Images</h2>
                <Button
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate('/image-creation/lifestyle')
                  }}
                  className="w-full"
                >
                  Create
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ImageCreation
