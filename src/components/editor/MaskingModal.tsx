// Ported verbatim from bball repo (src/components/editor/MaskingModal.tsx).
// Sport-agnostic — paints a mask on an image, uploads to the shared
// reference-images Supabase storage bucket, returns the masked image URL.

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Paintbrush2, RotateCcw } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

interface MaskingModalProps {
  isOpen: boolean
  onClose: () => void
  imageUrl: string
  onContinueToFix: (maskedImageUrl: string) => void
}

// supabase-js v2 doesn't expose supabaseUrl/supabaseKey as public typed
// properties — bball reads them directly anyway. Cast once here.
const supabaseUntyped = supabase as unknown as { supabaseUrl: string; supabaseKey: string }

export const MaskingModal: React.FC<MaskingModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  onContinueToFix,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushSize, setBrushSize] = useState([20])
  const [isErasing] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [originalDimensions, setOriginalDimensions] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (isOpen && imageUrl) loadImageWithProxy(imageUrl)
  }, [isOpen, imageUrl])

  useEffect(() => {
    if (imageLoaded && imageRef.current) setupCanvas(imageRef.current)
  }, [imageLoaded])

  const loadImageWithProxy = async (url: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('No auth token available')

      const proxyUrl = `${supabaseUntyped.supabaseUrl}/functions/v1/proxy-image?url=${encodeURIComponent(url)}`
      const proxyResponse = await fetch(proxyUrl, {
        headers: { Authorization: `Bearer ${token}`, apikey: supabaseUntyped.supabaseKey },
      })
      if (!proxyResponse.ok) throw new Error(`Proxy request failed: ${proxyResponse.status}`)
      const proxyBlob = await proxyResponse.blob()
      const blobUrl = URL.createObjectURL(proxyBlob)

      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = () => {
          URL.revokeObjectURL(blobUrl)
          resolve(undefined)
        }
        img.onerror = reject
        img.src = blobUrl
      })
      imageRef.current = img
      setImageLoaded(true)
      setupCanvas(img)
    } catch {
      try {
        const img = new Image()
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = url
        })
        imageRef.current = img
        setImageLoaded(true)
        setupCanvas(img)
      } catch {
        alert('Unable to load image. Please try with a different image or use the regular Fix Clothing feature.')
      }
    }
  }

  const setupCanvas = (img: HTMLImageElement): boolean => {
    const canvas = canvasRef.current
    const maskCanvas = maskCanvasRef.current
    if (!canvas || !maskCanvas) return false
    const ctx = canvas.getContext('2d')
    const maskCtx = maskCanvas.getContext('2d')
    if (!ctx || !maskCtx) return false

    setOriginalDimensions({ width: img.width, height: img.height })

    const maxWidth = 600
    const maxHeight = 600
    let { width, height } = img
    if (width === 0 || height === 0) return false
    if (width > maxWidth || height > maxHeight) {
      const scale = Math.min(maxWidth / width, maxHeight / height)
      width *= scale
      height *= scale
    }
    canvas.width = width
    canvas.height = height
    maskCanvas.width = width
    maskCanvas.height = height
    ctx.clearRect(0, 0, width, height)
    try {
      ctx.drawImage(img, 0, 0, width, height)
    } catch {
      // ignore
    }
    maskCtx.fillStyle = 'white'
    maskCtx.fillRect(0, 0, width, height)
    return true
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const maskCanvas = maskCanvasRef.current
    if (!canvas || !maskCanvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setIsDrawing(true)
    const ctx = canvas.getContext('2d')
    const maskCtx = maskCanvas.getContext('2d')
    if (ctx && maskCtx) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      maskCtx.beginPath()
      maskCtx.moveTo(x, y)
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    const maskCanvas = maskCanvasRef.current
    if (!canvas || !maskCanvas) return
    const ctx = canvas.getContext('2d')
    const maskCtx = maskCanvas.getContext('2d')
    if (!ctx || !maskCtx) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    ctx.lineWidth = brushSize[0]
    ctx.lineCap = 'round'
    maskCtx.lineWidth = brushSize[0]
    maskCtx.lineCap = 'round'

    if (isErasing) {
      ctx.globalCompositeOperation = 'source-over'
      const img = imageRef.current
      if (img) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(x, y, brushSize[0] / 2, 0, 2 * Math.PI)
        ctx.clip()
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        ctx.restore()
      }
      maskCtx.globalCompositeOperation = 'source-over'
      maskCtx.fillStyle = 'white'
      maskCtx.beginPath()
      maskCtx.arc(x, y, brushSize[0] / 2, 0, 2 * Math.PI)
      maskCtx.fill()
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = 'rgba(255, 0, 0, 1.0)'
      ctx.fillStyle = 'rgba(255, 0, 0, 1.0)'
      ctx.lineTo(x, y)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, y, brushSize[0] / 2, 0, 2 * Math.PI)
      ctx.fill()
      ctx.moveTo(x, y)
      maskCtx.globalCompositeOperation = 'source-over'
      maskCtx.fillStyle = 'black'
      maskCtx.strokeStyle = 'black'
      maskCtx.lineTo(x, y)
      maskCtx.stroke()
      maskCtx.beginPath()
      maskCtx.arc(x, y, brushSize[0] / 2, 0, 2 * Math.PI)
      maskCtx.fill()
      maskCtx.moveTo(x, y)
    }
  }

  const stopDrawing = () => setIsDrawing(false)

  const clearMask = () => {
    const canvas = canvasRef.current
    const maskCanvas = maskCanvasRef.current
    const img = imageRef.current
    if (!canvas || !maskCanvas || !img) return
    const ctx = canvas.getContext('2d')
    const maskCtx = maskCanvas.getContext('2d')
    if (!ctx || !maskCtx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    maskCtx.fillStyle = 'white'
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
  }

  const handleContinueToFix = async () => {
    const canvas = canvasRef.current
    const maskCanvas = maskCanvasRef.current
    const img = imageRef.current
    if (!canvas || !maskCanvas || !img || !originalDimensions) return

    try {
      const combinedCanvas = document.createElement('canvas')
      const combinedCtx = combinedCanvas.getContext('2d')
      if (!combinedCtx) throw new Error('Could not get canvas context')
      combinedCanvas.width = originalDimensions.width
      combinedCanvas.height = originalDimensions.height

      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('No auth token available for image loading')

      const proxyUrl = `${supabaseUntyped.supabaseUrl}/functions/v1/proxy-image?url=${encodeURIComponent(imageUrl)}`
      const proxyResponse = await fetch(proxyUrl, {
        headers: { Authorization: `Bearer ${token}`, apikey: supabaseUntyped.supabaseKey },
      })
      if (!proxyResponse.ok) throw new Error(`Proxy request failed: ${proxyResponse.status}`)
      const proxyBlob = await proxyResponse.blob()
      const blobUrl = URL.createObjectURL(proxyBlob)
      const fullResImg = new Image()
      await new Promise((resolve, reject) => {
        fullResImg.onload = () => {
          URL.revokeObjectURL(blobUrl)
          resolve(undefined)
        }
        fullResImg.onerror = reject
        fullResImg.src = blobUrl
      })
      combinedCtx.drawImage(fullResImg, 0, 0, originalDimensions.width, originalDimensions.height)

      const maskImageData = maskCanvas.getContext('2d')?.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
      if (maskImageData) {
        const scaledOverlayCanvas = document.createElement('canvas')
        scaledOverlayCanvas.width = originalDimensions.width
        scaledOverlayCanvas.height = originalDimensions.height
        const scaledOverlayCtx = scaledOverlayCanvas.getContext('2d')
        if (scaledOverlayCtx) {
          const scaleX = originalDimensions.width / maskCanvas.width
          const scaleY = originalDimensions.height / maskCanvas.height
          const scaledImageData = scaledOverlayCtx.createImageData(originalDimensions.width, originalDimensions.height)
          for (let y = 0; y < originalDimensions.height; y++) {
            for (let x = 0; x < originalDimensions.width; x++) {
              const maskX = Math.floor(x / scaleX)
              const maskY = Math.floor(y / scaleY)
              if (maskX < maskCanvas.width && maskY < maskCanvas.height) {
                const maskIndex = (maskY * maskCanvas.width + maskX) * 4
                const isBlack = maskImageData.data[maskIndex] < 128
                const scaledIndex = (y * originalDimensions.width + x) * 4
                if (isBlack) {
                  scaledImageData.data[scaledIndex] = 255
                  scaledImageData.data[scaledIndex + 1] = 0
                  scaledImageData.data[scaledIndex + 2] = 0
                  scaledImageData.data[scaledIndex + 3] = 255
                } else {
                  scaledImageData.data[scaledIndex + 3] = 0
                }
              }
            }
          }
          scaledOverlayCtx.putImageData(scaledImageData, 0, 0)
          combinedCtx.drawImage(scaledOverlayCanvas, 0, 0)
        }
      }

      const canvasBlob = await new Promise<Blob>((resolve, reject) => {
        combinedCanvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Failed to create blob'))),
          'image/jpeg',
          0.9,
        )
      })

      const fileName = `masked-images/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('reference-images')
        .upload(fileName, canvasBlob, { contentType: 'image/jpeg', cacheControl: '3600' })
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

      const {
        data: { publicUrl },
      } = supabase.storage.from('reference-images').getPublicUrl(fileName)
      onContinueToFix(publicUrl)
    } catch {
      onContinueToFix(imageUrl)
    }
  }

  const handleClose = () => {
    setImageLoaded(false)
    setOriginalDimensions(null)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Mask Areas to Fix</DialogTitle>
          <p className="text-sm text-gray-600">
            Paint over the areas you want to modify, then continue to select a replacement item.
          </p>
        </DialogHeader>
        <div className="flex items-center gap-4 p-4 border-b">
          <Button variant="default" size="sm">
            <Paintbrush2 className="h-4 w-4 mr-1" />
            Paint
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm">Brush Size:</span>
            <Slider
              value={brushSize}
              onValueChange={setBrushSize}
              min={5}
              max={50}
              step={1}
              className="w-32"
            />
            <span className="text-sm w-8">{brushSize[0]}</span>
          </div>
          <Button variant="outline" size="sm" onClick={clearMask}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 min-h-0">
          <div className="relative flex items-center justify-center w-full h-full">
            {imageLoaded ? (
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="border border-gray-300 rounded cursor-crosshair max-w-full max-h-full object-contain"
                style={{ cursor: 'crosshair' }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-96 space-y-4">
                <div className="text-gray-500">Loading image...</div>
                {imageUrl && (
                  <div className="text-center">
                    <p className="text-sm text-gray-400 mb-2">Preview:</p>
                    <img src={imageUrl} alt="Preview" className="max-w-sm max-h-64 border border-gray-300 rounded" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleContinueToFix} disabled={!imageLoaded}>
            Continue to Fix
          </Button>
        </div>
        <canvas ref={maskCanvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  )
}
