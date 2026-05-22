// Ported from bball repo (src/pages/Editor.tsx).
//
// Deltas vs bball:
//   - useReferenceImages no longer wires through AppState (adiGen doesn't
//     have AppStateContext); the hook now keeps its own state.
//   - reference_images query in the embedded fetchReferenceImages effect is
//     filtered by category = 'running-japan'.
//   - After every Edge Function invocation that returns an assetId, we tag
//     the new asset row with category = 'running-japan' (same band-aid as
//     LifestyleGen — the bball Edge Functions don't know about category).
//   - GarmentSelectionModal pulls from running-japan garments (handled in
//     the modal component itself).
//
// Everything else (chat UI, ChipButtons, masking flow, realtime updates)
// is verbatim from bball.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { ArrowLeft, Send } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { CATEGORY_SLUG } from '@/walking-motioncore'
import { useAssetContext } from '@/contexts/AssetContext'
import { useReferenceImages } from '@/hooks/useReferenceImages'
import { useAssetRealtime, type AssetChangePayload } from '@/hooks/useAssetRealtime'
import ChatImageModal from '@/components/ChatImageModal'
import ChipButtons from '@/components/editor/ChipButtons'
import { GarmentSelectionModal } from '@/components/editor/GarmentSelectionModal'
import { MaskingModal } from '@/components/editor/MaskingModal'

interface ChatMessage {
  id: string
  type: 'user' | 'ai'
  content: string
  imageUrl?: string
  imageUrls?: string[]
  referenceImageUrl?: string
  timestamp: Date
  assetId?: string
  status?: 'pending' | 'processing' | 'completed' | 'failed'
}

interface CombinedImage {
  id: string
  image_url: string
  thumbnail_url?: string | null
  prompt: string
  created_at: string
  type: 'asset' | 'reference'
}

interface EditorImageSelectorProps {
  images: CombinedImage[]
  onImageSelect: (imageUrl: string, assetId?: string) => void
}

const EditorImageSelector = ({ images, onImageSelect }: EditorImageSelectorProps) => {
  const [visibleItemsCount, setVisibleItemsCount] = useState(12)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleBrowseClick = () => fileInputRef.current?.click()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = (event) => {
        const imageUrl = event.target?.result as string
        onImageSelect(imageUrl)
      }
      reader.readAsDataURL(file)
    }
  }

  const visibleImages = images.slice(0, visibleItemsCount)

  return (
    <div className="flex-1 flex flex-col items-start justify-start overflow-y-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <div className="w-full space-y-8">
        <div className="flex items-center justify-between w-full px-4 py-3 bg-gray-100 rounded-lg border">
          <div className="text-sm font-medium leading-none text-muted-foreground">
            Choose an image to start your editing conversation
          </div>
          <Button onClick={handleBrowseClick} size="sm">
            Upload Image
          </Button>
        </div>
        {images.length > 0 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {visibleImages.map((img) => (
                <div
                  key={`${img.type}-${img.id}`}
                  onClick={() => onImageSelect(img.image_url, img.type === 'asset' ? img.id : undefined)}
                  className="group relative block cursor-pointer"
                  tabIndex={0}
                  role="button"
                  aria-label="View image"
                >
                  <div className="aspect-square bg-muted rounded-lg border-2 border-muted hover:border-primary transition-colors overflow-hidden relative">
                    <img
                      src={img.thumbnail_url || img.image_url}
                      alt={img.prompt}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      loading="lazy"
                    />
                  </div>
                </div>
              ))}
            </div>
            {visibleItemsCount < images.length && (
              <div className="flex justify-center mt-6">
                <Button
                  onClick={() => setVisibleItemsCount((p) => Math.min(p + 12, images.length))}
                  variant="outline"
                  className="px-8 py-2"
                >
                  See more
                </Button>
              </div>
            )}
          </div>
        )}
        {images.length === 0 && (
          <div className="text-center text-muted-foreground">
            No images available yet. Generate or upload some images first.
          </div>
        )}
      </div>
    </div>
  )
}

const Editor = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentMessage, setCurrentMessage] = useState('')
  const [selectedReference, setSelectedReference] = useState<string | null>(null)
  const [selectedReferenceAssetId, setSelectedReferenceAssetId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt?: string } | null>(null)
  const [combinedImages, setCombinedImages] = useState<CombinedImage[]>([])
  const [editorPhase, setEditorPhase] = useState<'selection' | 'chat'>('selection')
  const [pendingAssets, setPendingAssets] = useState<Set<string>>(new Set())
  const [showGarmentModal, setShowGarmentModal] = useState(false)
  const [showMaskingModal, setShowMaskingModal] = useState(false)
  const [maskedImageUrl, setMaskedImageUrl] = useState<string | null>(null)
  const [detectedPose, setDetectedPose] = useState<string | null>(null)
  const { assets, refreshAssets } = useAssetContext()
  useReferenceImages()
  const location = useLocation()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Extract pose name from a lifestyle-generated asset's prompt
  // Format: "<garment slots> - <pose_name>"
  const detectPoseFromAsset = useCallback(
    (assetId?: string | null, imageUrl?: string | null) => {
      if (!assetId && !imageUrl) return
      const asset = assets.find(
        (a) => (assetId && a.id === assetId) || (imageUrl && a.image_url === imageUrl),
      )
      if (asset?.prompt) {
        const parts = asset.prompt.split(' - ')
        if (parts.length >= 2) {
          setDetectedPose(parts[parts.length - 1].trim())
          return
        }
      }
      setDetectedPose(null)
    },
    [assets],
  )

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isGenerating])

  useEffect(() => {
    if (location.state?.referenceImage) {
      setSelectedReference(location.state.referenceImage)
      setSelectedReferenceAssetId(location.state.assetId || null)
      setEditorPhase('chat')
      addInitialAIMessages(location.state.referenceImage)
      detectPoseFromAsset(location.state.assetId, location.state.referenceImage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  useEffect(() => {
    const fetchReferenceImages = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        const { data: refImages, error } = await supabase
          .from('reference_images')
          .select('*')
          .eq('user_id', user.id)
          .eq('category', CATEGORY_SLUG)
          .order('created_at', { ascending: false })
        if (error) return

        const assetsData: CombinedImage[] = assets.map((a) => ({
          id: a.id,
          image_url: a.image_url,
          thumbnail_url: a.thumbnail_url,
          prompt: 'Generated image',
          created_at: a.created_at,
          type: 'asset' as const,
        }))
        const referenceData: CombinedImage[] = (refImages || []).map((ref: any) => ({
          id: ref.id,
          image_url: ref.url,
          prompt: ref.name,
          created_at: ref.created_at,
          type: 'reference' as const,
        }))
        const combined = [...assetsData, ...referenceData].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        setCombinedImages(combined)
      } catch {
        // ignore
      }
    }
    fetchReferenceImages()
  }, [assets])

  const addMessage = (
    type: 'user' | 'ai',
    content: string,
    imageUrl?: string,
    referenceImageUrl?: string,
    assetId?: string,
    status?: 'pending' | 'processing' | 'completed' | 'failed',
  ) => {
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      type,
      content,
      imageUrl,
      referenceImageUrl,
      timestamp: new Date(),
      assetId,
      status,
    }
    setMessages((prev) => [...prev, newMessage])
    setTimeout(scrollToBottom, 100)
    return newMessage.id
  }

  const updateMessageWithAssetResult = useCallback(
    (
      assetId: string,
      status: 'completed' | 'failed',
      imageUrl: string | null,
      allImages: string[],
      errorMessage: string | null,
    ) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.assetId === assetId) {
            const updated: ChatMessage = { ...msg, status }
            if (status === 'completed' && imageUrl) {
              updated.imageUrl = imageUrl
              if (allImages.length > 1) updated.imageUrls = allImages
              if (msg.content === 'Processing your image upscaling...') {
                updated.content = "Here's your upscaled image:"
              } else if (msg.content.includes('fixing')) {
                const clothingItem = msg.content.match(/fixing (.+)\.\.\./)?.[1] || 'clothing'
                updated.content = `Here's your generated image fixing ${clothingItem}:`
              } else if (msg.content.includes('resize to')) {
                const aspectRatio = msg.content.match(/resize to (.+)\.\.\./)?.[1] || 'aspect ratio'
                updated.content = `Here's your image resized to ${aspectRatio}:`
              } else {
                updated.content = "Here's your generated image:"
              }
              setSelectedReference(imageUrl)
            } else if (status === 'failed') {
              updated.content = errorMessage || 'Sorry, I encountered an error while generating the image.'
            }
            return updated
          }
          return msg
        }),
      )
      setPendingAssets((prev) => {
        const next = new Set(prev)
        next.delete(assetId)
        return next
      })
      refreshAssets()
      if (status === 'completed') toast.success('Image generated successfully!')
      else if (status === 'failed') toast.error('Failed to generate image')
    },
    [refreshAssets],
  )

  const handleEditorAssetChange = useCallback(
    (payload: AssetChangePayload) => {
      if (payload.eventType !== 'UPDATE') return
      const asset: any = payload.new
      if (!pendingAssets.has(asset.id)) return
      const status = asset.status
      if (status !== 'completed' && status !== 'failed') return

      let displayImageUrl = asset.image_url
      if (asset.format_1_1 || asset.format_16_9 || asset.format_9_16 || asset.format_4_5 || asset.format_4_3) {
        const width = asset.width || 1
        const height = asset.height || 1
        const ar = width / height
        if (ar > 1.5 && asset.format_16_9) displayImageUrl = asset.format_16_9
        else if (ar < 0.7 && asset.format_9_16) displayImageUrl = asset.format_9_16
        else if (ar >= 0.7 && ar <= 0.85 && asset.format_4_5) displayImageUrl = asset.format_4_5
        else if (asset.format_1_1) displayImageUrl = asset.format_1_1
      }
      const allImages = asset.all_images || (displayImageUrl ? [displayImageUrl] : [])
      updateMessageWithAssetResult(asset.id, status as 'completed' | 'failed', displayImageUrl, allImages, asset.error_message)
    },
    [pendingAssets, updateMessageWithAssetResult],
  )

  useAssetRealtime(handleEditorAssetChange)

  // Tag a newly created asset with our category. Edge Functions live in the
  // bball repo and don't know about category, so we patch the row here.
  const tagAssetCategory = async (assetId: string) => {
    await supabase.from('assets').update({ category: CATEGORY_SLUG }).eq('id', assetId)
  }

  const addInitialAIMessages = (imageUrl: string) => {
    setMessages([])
    setMessages([
      {
        id: crypto.randomUUID(),
        type: 'ai',
        content: "Here's your selected reference image:",
        imageUrl,
        timestamp: new Date(),
      },
      {
        id: crypto.randomUUID(),
        type: 'ai',
        content:
          'Tell me, what do you want to modify in this image? Keep it simple, describe simply what needs to be different and what needs to stay the same.',
        timestamp: new Date(),
      },
    ])
  }

  const handleUpscaleImage = async () => {
    if (!selectedReference) {
      toast.error('Please select a reference image first')
      return
    }
    if (!selectedReferenceAssetId) {
      toast.error('Cannot upscale: Asset ID not found. Please select an image from your assets.')
      return
    }
    addMessage('user', 'Upscale the image', undefined, selectedReference)
    setIsGenerating(true)
    try {
      const { data, error } = await supabase.functions.invoke('upscale-image', {
        body: { image_url: selectedReference, asset_id: selectedReferenceAssetId },
      })
      if (error) {
        toast.error('Failed to upscale image. Please try again.')
        addMessage('ai', 'Sorry, I encountered an error while upscaling the image.')
        return
      }
      if (data?.error) {
        toast.error(data.error)
        addMessage('ai', 'Sorry, I encountered an error while upscaling the image.')
        return
      }
      if (data?.success && data.assetId) {
        addMessage('ai', 'Processing your image upscaling...', undefined, undefined, data.assetId, 'pending')
        setPendingAssets((prev) => new Set([...prev, data.assetId]))
        await tagAssetCategory(data.assetId)
        toast.success('Image upscaling started!')
      } else {
        toast.error('Failed to start image upscaling')
        addMessage('ai', "Sorry, I couldn't start upscaling that image.")
      }
    } catch {
      toast.error('Failed to upscale image. Please try again.')
      addMessage('ai', 'Sorry, I encountered an error while upscaling the image.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSendMessage = async (
    customPrompt?: string,
    aspectRatio?: string,
    additionalImages?: string[],
    isFixClothing?: boolean,
    clothingItem?: string,
    maskedImage?: string,
    garmentMeta?: { garmentId: string; garmentCategory: string; poseName: string | null },
    displayOverride?: string,
  ) => {
    const messageToSend = customPrompt || currentMessage
    if (!messageToSend.trim()) {
      toast.error('Please enter a message')
      return
    }
    if (!selectedReference) {
      toast.error('Please select a reference image first')
      return
    }

    let displayMessage = displayOverride || messageToSend
    if (aspectRatio === '9:16') displayMessage = 'Resize to 9:16'
    else if (aspectRatio === '16:9') displayMessage = 'Resize to 16:9'

    addMessage('user', displayMessage, undefined, selectedReference)
    if (!customPrompt) setCurrentMessage('')

    setIsGenerating(true)
    try {
      const referenceImageToUse = maskedImage || selectedReference
      const requestBody: any = { prompt: messageToSend.trim(), referenceImageUrl: referenceImageToUse }

      if (additionalImages && additionalImages.length > 0) {
        requestBody.imageUrls = [...additionalImages, referenceImageToUse]
        delete requestBody.referenceImageUrl
      }
      if (garmentMeta?.garmentId && garmentMeta?.garmentCategory && garmentMeta?.poseName) {
        requestBody.garmentId = garmentMeta.garmentId
        requestBody.garmentCategory = garmentMeta.garmentCategory
        requestBody.poseName = garmentMeta.poseName
      }
      if (aspectRatio) {
        requestBody.aspect_ratio = aspectRatio
        if (aspectRatio === '9:16') requestBody.display_prompt = 'Resize to 9:16'
        else if (aspectRatio === '16:9') requestBody.display_prompt = 'Resize to 16:9'
      }

      const { data, error } = await supabase.functions.invoke('generate-image', { body: requestBody })
      if (error) {
        toast.error('Failed to generate image. Please try again.')
        addMessage('ai', 'Sorry, I encountered an error while generating the image.')
        return
      }
      if (data?.error) {
        toast.error(data.error)
        addMessage('ai', `Sorry, I encountered an error: ${data.error}`)
        return
      }
      if (data?.success && data.assetId) {
        let processingMessage = 'Processing your image...'
        if (isFixClothing && clothingItem) {
          const cleanName = clothingItem.replace(/_[A-Z0-9]{5,}$/i, '').trim()
          processingMessage = `Processing your image fixing ${cleanName}...`
        } else if (aspectRatio) {
          processingMessage = `Processing your image resize to ${aspectRatio}...`
        }
        addMessage('ai', processingMessage, undefined, undefined, data.assetId, 'pending')
        setPendingAssets((prev) => new Set([...prev, data.assetId]))
        await tagAssetCategory(data.assetId)
        toast.success('Image generation started!')
      } else {
        toast.error('Failed to start image generation')
        addMessage('ai', "Sorry, I couldn't start generating an image for that prompt.")
      }
    } catch {
      toast.error('Failed to generate image. Please try again.')
      addMessage('ai', 'Sorry, I encountered an error while generating the image.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleImageSelection = (imageUrl: string, assetId?: string) => {
    setSelectedReference(imageUrl)
    setSelectedReferenceAssetId(assetId || null)
    setEditorPhase('chat')
    addInitialAIMessages(imageUrl)
    detectPoseFromAsset(assetId, imageUrl)
  }

  const handleBackToSelection = () => {
    setEditorPhase('selection')
    setSelectedReference(null)
    setSelectedReferenceAssetId(null)
    setMessages([])
  }

  const handleChipClick = (prompt: string, aspectRatio: string) => handleSendMessage(prompt, aspectRatio)

  const handleMaskingComplete = (maskedImageDataUrl: string) => {
    setMaskedImageUrl(maskedImageDataUrl)
    setShowMaskingModal(false)
    setShowGarmentModal(true)
  }

  const handleGarmentSelect = (item: any) => {
    let prompt = ''
    if (item.category === 'shoes') {
      prompt = `Change the shoes on the model to this pair of adidas ${item.name.toLowerCase()} sneakers`
    } else if (item.category === 'tops') {
      prompt = `Change the top on the model to use this adidas ${item.name.toLowerCase()}`
    } else if (item.category === 'bottoms') {
      prompt = `Change the bottoms on the model to use this adidas ${item.name.toLowerCase()}`
    }
    const displayName = item.name.replace(/_[A-Z0-9]{5,}$/i, '').trim()
    let displayPrompt = ''
    if (item.category === 'shoes') {
      displayPrompt = `Change the shoes on the model to this pair of Adidas ${displayName} sneakers`
    } else if (item.category === 'tops') {
      displayPrompt = `Change the top on the model to use this Adidas ${displayName}`
    } else if (item.category === 'bottoms') {
      displayPrompt = `Change the bottoms on the model to use this Adidas ${displayName}`
    }

    const imageToUse = maskedImageUrl || selectedReference || ''
    const additionalImages = [item.imageUrl]
    handleSendMessage(
      prompt,
      undefined,
      additionalImages,
      true,
      item.name,
      imageToUse,
      { garmentId: item.id, garmentCategory: item.category, poseName: detectedPose },
      displayPrompt,
    )
    setShowGarmentModal(false)
    setMaskedImageUrl(null)
  }

  const handleImageModify = (imageUrl: string) => {
    setSelectedReference(imageUrl)
    addInitialAIMessages(imageUrl)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        {editorPhase === 'selection' ? (
          <div className="h-full space-y-6">
            <h1 className="text-3xl font-bold text-foreground">Editor</h1>
            <EditorImageSelector images={combinedImages} onImageSelect={handleImageSelection} />
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {selectedReference && (
              <div className="flex-shrink-0 mb-4 sm:mb-6 p-2 sm:p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-4">
                    <img
                      src={selectedReference}
                      alt="Selected reference"
                      className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg border shadow-sm"
                    />
                    <div>
                      <p className="text-sm sm:text-base font-semibold">Reference Image Selected</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">Ready to start editing</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBackToSelection}
                    className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
                  >
                    <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">Change Image</span>
                    <span className="sm:hidden">Change</span>
                  </Button>
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 bg-card rounded-xl shadow-lg border overflow-hidden">
              <div className="h-full flex flex-col">
                <ScrollArea className="flex-1 p-4">
                  <div className="min-h-full flex flex-col justify-end">
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-lg p-3 ${message.type === 'user' ? 'bg-muted text-primary' : 'bg-muted'}`}>
                            {(message.referenceImageUrl || message.imageUrl) && (
                              <div>
                                {message.referenceImageUrl && (
                                  <img
                                    src={message.referenceImageUrl}
                                    alt="Reference"
                                    className="w-28 h-20 object-cover rounded border mb-2 cursor-pointer transition-all hover:scale-105"
                                    onClick={() =>
                                      setSelectedImage({ url: message.referenceImageUrl!, alt: 'Reference' })
                                    }
                                  />
                                )}
                                {message.imageUrls && message.imageUrls.length > 1 ? (
                                  <div className="grid grid-cols-2 gap-2 max-w-sm mb-2">
                                    {message.imageUrls.map((url, index) => (
                                      <img
                                        key={index}
                                        src={url}
                                        alt={`Generated image ${index + 1}`}
                                        className="w-full rounded-lg cursor-pointer transition-all hover:scale-105"
                                        onClick={() => setSelectedImage({ url, alt: `Generated ${index + 1}` })}
                                      />
                                    ))}
                                  </div>
                                ) : (
                                  message.imageUrl && (
                                    <img
                                      src={message.imageUrl}
                                      alt="Generated image"
                                      className="w-full max-w-sm rounded-lg mb-2 cursor-pointer transition-all hover:scale-105"
                                      onClick={() => setSelectedImage({ url: message.imageUrl!, alt: 'Generated' })}
                                    />
                                  )
                                )}
                              </div>
                            )}
                            {message.status === 'pending' && !message.imageUrl && (
                              <div className="flex items-center space-x-2 mb-2">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                                <span className="text-sm text-muted-foreground">Generating...</span>
                              </div>
                            )}
                            <p className="text-sm mt-1">{message.content}</p>
                            <p className="text-xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</p>
                          </div>
                        </div>
                      ))}
                      {isGenerating && (
                        <div className="flex justify-start">
                          <div className="bg-muted rounded-lg p-3 max-w-[80%]">
                            <div className="flex items-center space-x-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                              <p className="text-sm">Starting image generation...</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="border-t p-4 flex-shrink-0 bg-card">
                  <ChipButtons
                    onChipClick={handleChipClick}
                    onUpscaleClick={handleUpscaleImage}
                    onFixClothingClick={() => setShowGarmentModal(true)}
                    onMaskAndFixClick={() => {
                      if (!selectedReference) {
                        toast.error('Please select an image first')
                        return
                      }
                      setShowMaskingModal(true)
                    }}
                    disabled={isGenerating || !selectedReference}
                  />
                  <div className="flex space-x-2">
                    <Input
                      value={currentMessage}
                      onChange={(e) => setCurrentMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Describe how you want to edit your image..."
                      disabled={isGenerating || !selectedReference}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => handleSendMessage()}
                      disabled={isGenerating || !currentMessage.trim() || !selectedReference}
                      size="icon"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedImage && (
        <ChatImageModal
          open={!!selectedImage}
          imageUrl={selectedImage.url}
          alt={selectedImage.alt}
          onClose={() => setSelectedImage(null)}
          onModify={handleImageModify}
        />
      )}

      <GarmentSelectionModal
        isOpen={showGarmentModal}
        onClose={() => setShowGarmentModal(false)}
        onSelect={handleGarmentSelect}
      />

      <MaskingModal
        isOpen={showMaskingModal}
        onClose={() => setShowMaskingModal(false)}
        imageUrl={selectedReference || ''}
        onContinueToFix={handleMaskingComplete}
      />
    </div>
  )
}

export default Editor
