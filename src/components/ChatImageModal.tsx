// Ported verbatim from bball repo (src/components/ChatImageModal.tsx).
import React from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, Edit, X } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

interface ChatImageModalProps {
  open: boolean
  onClose: () => void
  imageUrl: string
  alt?: string
  onModify?: (imageUrl: string) => void
}

const supabaseUntyped = supabase as unknown as { supabaseUrl: string }

const ChatImageModal: React.FC<ChatImageModalProps> = ({
  open,
  onClose,
  imageUrl,
  alt = 'image',
  onModify,
}) => {
  const handleDownload = async () => {
    try {
      const proxyUrl = `${supabaseUntyped.supabaseUrl}/functions/v1/proxy-image?url=${encodeURIComponent(imageUrl)}`
      const response = await fetch(proxyUrl, {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      })
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `image-${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
        toast.success('Image downloaded successfully')
      } else {
        throw new Error('Failed to fetch image')
      }
    } catch {
      toast.error('Failed to download image')
    }
  }

  const handleModify = () => {
    if (onModify) {
      onModify(imageUrl)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl w-[95vw] p-0 sm:p-0 flex flex-col items-center bg-background overflow-visible">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-30 rounded-full bg-zinc-800 hover:bg-zinc-700 shadow p-2 focus:outline-none"
          tabIndex={0}
        >
          <X className="h-5 w-5 text-white" />
        </button>
        <div className="absolute top-3 left-3 z-30 flex gap-2">
          <Button onClick={handleDownload} variant="secondary" size="sm" className="bg-zinc-800 hover:bg-zinc-700 text-white border-0">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          {onModify && (
            <Button onClick={handleModify} variant="secondary" size="sm" className="bg-zinc-800 hover:bg-zinc-700 text-white border-0">
              <Edit className="h-4 w-4 mr-2" />
              Modify
            </Button>
          )}
        </div>
        <div className="w-full flex justify-center items-center">
          <img
            src={imageUrl}
            alt={alt}
            className="max-h-[80vh] max-w-full rounded-lg object-contain m-4 border shadow-xl"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ChatImageModal
