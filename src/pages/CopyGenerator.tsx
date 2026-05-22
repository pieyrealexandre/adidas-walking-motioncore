// Adapted from bball repo (src/pages/CopyGenerator.tsx).
//
// Deltas vs bball:
//   - PRODUCTS source: src/running-japan/products.ts (Supernova line). Section
//     header is "Supernova" instead of "Basketball"; franchise filter swapped.
//   - All saved_copy + copy_projects inserts include category = 'running-japan'.
//   - Sample prompt text in the brief textarea references running, not basketball.
//
// Everything else (Step 1/2 flow, touchpoint groups, format chips, heart-to-save,
// project picker, regenerate-per-touchpoint, flagged issues UI) is verbatim.

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { copyGenerator } from '@/lib/copy-agents/copyGenerator'
import type {
  CopyGenerationRequest,
  CopyGenerationResponse,
  CopyVariation,
} from '@/lib/copy-agents/types'
import { AlertCircle, CheckCircle2, ChevronDown, Heart, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { CATEGORY_SLUG, PRODUCTS } from '@/walking-motioncore'

interface CopyProject {
  id: string
  name: string
  created_at: string
}

const touchpointGroups = [
  {
    label: 'Homepage (HP)',
    items: [
      { value: 'hp-banner-hero', label: 'Banner Hero' },
      { value: 'hp-card-teaser', label: 'Card Teaser' },
    ],
  },
  {
    label: 'Gender Landing Page (GLP)',
    items: [
      { value: 'glp-banner-hero', label: 'Banner Hero' },
      { value: 'glp-card-teaser', label: 'Card Teaser' },
    ],
  },
  {
    label: 'Category Landing Page (CatLP)',
    items: [
      { value: 'catlp-banner-hero', label: 'Banner Hero' },
      { value: 'catlp-card-teaser', label: 'Card Teaser' },
      { value: 'catlp-banner-statement', label: 'Banner Statement' },
      { value: 'catlp-banner-split', label: 'Banner Split' },
    ],
  },
  {
    label: 'Campaign Landing Page (CLP)',
    items: [
      { value: 'clp-banner-hero', label: 'Banner Hero' },
      { value: 'clp-card-teaser', label: 'Card Teaser' },
      { value: 'clp-banner-statement', label: 'Banner Statement' },
      { value: 'clp-banner-split', label: 'Banner Split' },
    ],
  },
  {
    label: 'Product Detail Page (PDP)',
    items: [
      { value: 'pdp-banner-statement', label: 'Banner Statement' },
      { value: 'pdp-banner-snippet', label: 'Banner Snippet' },
      { value: 'pdp-banner-split', label: 'Banner Split' },
    ],
  },
  {
    label: 'Product Landing Page (PLP)',
    items: [
      { value: 'plp-banner-statement', label: 'Banner Statement' },
      { value: 'plp-banner-snippet', label: 'Banner Snippet' },
    ],
  },
  {
    label: 'App & Other',
    items: [
      { value: 'email', label: 'Email/CRM' },
      { value: 'push-notification', label: 'Push Notification' },
      { value: 'ugc', label: 'User Generated Content' },
      { value: 'app-drop-card', label: 'App Drop Card' },
      { value: 'drop-detail-page', label: 'Drop Detail Page' },
      { value: 'app-pdp-callout', label: 'App PDP Callout' },
    ],
  },
]

const touchpointOptions = touchpointGroups.flatMap((g) => g.items)

const formatOptions = [
  { value: 'headline', label: 'Headline' },
  { value: 'body', label: 'Body' },
  { value: 'subject', label: 'Subject Line' },
  { value: 'preheader', label: 'Preheader' },
  { value: 'snippet', label: 'Snippet' },
]

const CopyGeneratorPage = () => {
  const { user } = useAuth()
  const [prompt, setPrompt] = useState('')
  const [productName, setProductName] = useState('')
  const [selectedProductId, setSelectedProductId] = useState<string>('none')
  const [selectedTouchpoints, setSelectedTouchpoints] = useState<string[]>(['hp-banner-hero'])
  const [isKids] = useState(false)
  const [formatType, setFormatType] = useState<string>('headline-body')
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(new Set(['headline', 'body']))
  const [enableCharacterLimit] = useState(false)
  const [characterLimit] = useState(20)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<CopyGenerationResponse | null>(null)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1)
  const [likedVariations, setLikedVariations] = useState<Set<string>>(new Set())
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [regeneratingTouchpoints, setRegeneratingTouchpoints] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const [projects, setProjects] = useState<CopyProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('none')
  const [newProjectName, setNewProjectName] = useState('')

  const toggleFormat = (format: string) => {
    setSelectedFormats((prev) => {
      const next = new Set(prev)
      if (next.has(format)) {
        if (next.size > 1) next.delete(format)
      } else {
        next.add(format)
      }
      const hasHeadline = next.has('headline')
      const hasBody = next.has('body')
      const hasExtra = next.has('subject') || next.has('preheader') || next.has('snippet')
      if (hasExtra || (hasHeadline && hasBody && next.size > 2)) {
        setFormatType('full')
      } else if (hasHeadline && hasBody) {
        setFormatType('headline-body')
      } else if (hasHeadline && !hasBody) {
        setFormatType('headline-only')
      } else {
        setFormatType('full')
      }
      return next
    })
  }

  const toggleGroupAll = (group: (typeof touchpointGroups)[number]) => {
    const allSelected = group.items.every((item) => selectedTouchpoints.includes(item.value))
    if (allSelected) {
      setSelectedTouchpoints((prev) => prev.filter((t) => !group.items.some((item) => item.value === t)))
    } else {
      setSelectedTouchpoints((prev) => {
        const set = new Set(prev)
        group.items.forEach((item) => set.add(item.value))
        return Array.from(set)
      })
    }
  }

  useEffect(() => {
    if (user) loadProjects()
  }, [user])

  const loadProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('copy_projects')
        .select('*')
        .eq('category', CATEGORY_SLUG)
        .order('created_at', { ascending: false })
      if (error) throw error
      setProjects(data || [])
    } catch {
      // ignore
    }
  }

  const createProject = async (): Promise<string | null> => {
    if (!newProjectName.trim() || !user) return null
    try {
      const { data, error } = await supabase
        .from('copy_projects')
        .insert({
          user_id: user.id,
          name: newProjectName.trim(),
          category: CATEGORY_SLUG,
        })
        .select()
        .single()
      if (error) throw error
      setProjects((prev) => [data, ...prev])
      setNewProjectName('')
      toast.success(`Project "${data.name}" created`)
      return data.id
    } catch {
      toast.error('Failed to create project')
      return null
    }
  }

  const toggleTouchpoint = (touchpoint: string) => {
    setSelectedTouchpoints((prev) =>
      prev.includes(touchpoint) ? prev.filter((t) => t !== touchpoint) : [...prev, touchpoint],
    )
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || selectedTouchpoints.length === 0) return
    if (selectedProjectId === 'new' && !newProjectName.trim()) {
      toast.error('Please enter a project name')
      return
    }

    setIsGenerating(true)
    setResult(null)
    setGenerationError(null)
    setCurrentStep(2)

    try {
      if (selectedProjectId === 'new') {
        const newProjectId = await createProject()
        if (newProjectId) {
          setSelectedProjectId(newProjectId)
        } else {
          setSelectedProjectId('none')
        }
      }

      const selectedProduct = PRODUCTS.find((p) => p.id === selectedProductId)
      const effectiveProductName = selectedProduct?.name || productName
      const effectiveCategory = selectedProduct?.category || 'general'

      const request: CopyGenerationRequest = {
        prompt: prompt.trim(),
        productInfo: effectiveProductName
          ? { name: effectiveProductName, category: effectiveCategory }
          : undefined,
        config: {
          enableCharacterLimit,
          characterLimit: enableCharacterLimit ? characterLimit : undefined,
          touchpoints: selectedTouchpoints,
          formatType,
          variationsPerTouchpoint: 4,
          productId: selectedProductId !== 'none' ? selectedProductId : undefined,
        },
      }

      const response = await copyGenerator.generate(request)
      setResult(response)
    } catch (error: any) {
      const errorMessage = error?.message || ''
      if (
        errorMessage.includes('429') ||
        errorMessage.includes('rate') ||
        errorMessage.includes('limit') ||
        errorMessage.includes('529') ||
        errorMessage.includes('overloaded')
      ) {
        setGenerationError('This request is a bit too much. Please retry with fewer touchpoints selected.')
      } else {
        setGenerationError('Something went wrong generating copy. Please try again.')
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const handleBackToSettings = () => {
    setCurrentStep(1)
    setResult(null)
    setGenerationError(null)
  }

  const handleLikeVariation = async (
    variation: CopyVariation,
    touchpoint: string,
    touchpointLabel: string,
  ) => {
    if (!user) {
      toast.error('Please log in to save copy')
      return
    }

    const variationKey = `${touchpoint}-${JSON.stringify(variation)}`

    if (likedVariations.has(variationKey)) {
      setLikedVariations((prev) => {
        const next = new Set(prev)
        next.delete(variationKey)
        return next
      })
      toast.success('Removed from Notebook')
      return
    }

    try {
      const selectedProduct = PRODUCTS.find((p) => p.id === selectedProductId)
      const effectiveProductName = selectedProduct?.name || productName || null

      const { error } = await supabase.from('saved_copy').insert({
        user_id: user.id,
        headline: variation.headline,
        body: variation.body,
        subject: variation.subject,
        preheader: variation.preheader,
        snippet: variation.snippet,
        full_text: variation.fullText,
        touchpoint: touchpointLabel,
        character_count: variation.characterCount,
        original_prompt: prompt,
        product_name: effectiveProductName,
        is_kids: isKids,
        format_type: formatType,
        project_id: selectedProjectId !== 'none' && selectedProjectId !== 'new' ? selectedProjectId : null,
        category: CATEGORY_SLUG,
      })

      if (error) throw error

      setLikedVariations((prev) => new Set(prev).add(variationKey))
      toast.success('Saved to Notebook')
    } catch {
      toast.error('Failed to save copy')
    }
  }

  const handleRegenerateTouchpoint = async (touchpoint: string) => {
    if (regeneratingTouchpoints.has(touchpoint)) return
    setRegeneratingTouchpoints((prev) => new Set(prev).add(touchpoint))

    try {
      const selectedProduct = PRODUCTS.find((p) => p.id === selectedProductId)
      const effectiveProductName = selectedProduct?.name || productName
      const effectiveCategory = selectedProduct?.category || 'general'

      const request: CopyGenerationRequest = {
        prompt: prompt.trim(),
        productInfo: effectiveProductName
          ? { name: effectiveProductName, category: effectiveCategory }
          : undefined,
        config: {
          enableCharacterLimit,
          characterLimit: enableCharacterLimit ? characterLimit : undefined,
          touchpoints: [touchpoint],
          formatType,
          variationsPerTouchpoint: 4,
          productId: selectedProductId !== 'none' ? selectedProductId : undefined,
        },
      }

      const response = await copyGenerator.generate(request)
      if (response.results && response.results.length > 0 && result) {
        const newVariations = response.results[0].variations
        setResult((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            results: prev.results.map((r) => {
              if (r.touchpoint === touchpoint) {
                return { ...r, variations: [...r.variations, ...newVariations] }
              }
              return r
            }),
          }
        })
        toast.success(`Added ${newVariations.length} more variations`)
      }
    } catch {
      toast.error('Failed to generate more variations')
    } finally {
      setRegeneratingTouchpoints((prev) => {
        const next = new Set(prev)
        next.delete(touchpoint)
        return next
      })
    }
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <h1 className="text-3xl font-bold text-foreground">Copy Generator</h1>

      {currentStep === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="space-y-3">
            <Label>Touchpoints</Label>
            <div className="flex flex-wrap gap-2">
              {formatOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleFormat(option.value)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    selectedFormats.has(option.value)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3">
              {touchpointGroups.map((group) => {
                const allSelected = group.items.every((item) => selectedTouchpoints.includes(item.value))
                const someSelected = group.items.some((item) => selectedTouchpoints.includes(item.value))
                const isExpanded = expandedGroups.has(group.label)
                return (
                  <div key={group.label} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                        onClick={() => toggleGroupAll(group)}
                      >
                        <Checkbox
                          checked={allSelected}
                          className={someSelected && !allSelected ? 'opacity-50' : ''}
                        />
                        <span className="text-xs font-semibold text-muted-foreground select-none truncate">
                          {group.label}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroups((prev) => {
                            const next = new Set(prev)
                            if (next.has(group.label)) next.delete(group.label)
                            else next.add(group.label)
                            return next
                          })
                        }
                        className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="space-y-1.5 pl-1">
                        {group.items.map((option) => (
                          <div key={option.value} className="flex items-center space-x-2">
                            <Checkbox
                              id={option.value}
                              checked={selectedTouchpoints.includes(option.value)}
                              onCheckedChange={() => toggleTouchpoint(option.value)}
                              className="h-3.5 w-3.5"
                            />
                            <label htmlFor={option.value} className="text-xs leading-none cursor-pointer">
                              {option.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-2 lg:col-span-3 flex flex-col">
            <Label htmlFor="prompt">Brief</Label>
            <div className="border rounded-lg overflow-hidden flex flex-col flex-1">
              <Textarea
                id="prompt"
                placeholder="Enter your copy brief (e.g., 'New running shoes with responsive cushioning, launching this Friday for the Tokyo marathon')"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 flex-1 min-h-[120px]"
              />
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Product</span>
                    <Select
                      value={selectedProductId}
                      onValueChange={(value) => {
                        setSelectedProductId(value)
                        if (value !== 'none' && value !== 'custom') setProductName('')
                      }}
                    >
                      <SelectTrigger className="h-7 w-auto min-w-[160px] text-xs">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Supernova
                        </div>
                        {PRODUCTS.filter((p) => p.franchise === 'supernova').map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-px h-4 bg-border" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Project</span>
                    <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                      <SelectTrigger className="h-7 w-auto min-w-[160px] text-xs">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="new" className="text-primary font-medium">
                          + New project...
                        </SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || selectedTouchpoints.length === 0 || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Generate'
                  )}
                </Button>
              </div>
            </div>
            {(selectedProductId === 'custom' || selectedProjectId === 'new') && (
              <div className="flex gap-3">
                {selectedProductId === 'custom' && (
                  <Input
                    id="productName"
                    placeholder="Custom product name..."
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="h-8 text-xs"
                  />
                )}
                {selectedProjectId === 'new' && (
                  <Input
                    id="newProjectName"
                    placeholder="New project name..."
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="h-8 text-xs"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="space-y-6">
          {isGenerating && (
            <div className="text-center py-20">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-6 text-muted-foreground" />
              <p className="text-lg text-muted-foreground">
                Generating copy for {selectedTouchpoints.length} touchpoint
                {selectedTouchpoints.length !== 1 ? 's' : ''}...
              </p>
            </div>
          )}

          {generationError && !isGenerating && (
            <div className="text-center py-20">
              <AlertCircle className="h-12 w-12 mx-auto mb-6 text-destructive" />
              <p className="text-lg text-destructive mb-6">{generationError}</p>
              <Button onClick={handleBackToSettings}>Back to Settings</Button>
            </div>
          )}

          {result && result.results && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Generated Copy</h2>
                <Button variant="outline" onClick={handleBackToSettings}>
                  Back to Settings
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {result.results.map((touchpointResult, tpIndex) => {
                  const isRegenerating = regeneratingTouchpoints.has(touchpointResult.touchpoint)
                  const touchpointLabel =
                    touchpointOptions.find((opt) => opt.value === touchpointResult.touchpoint)?.label ||
                    touchpointResult.touchpoint
                  return (
                    <Card key={tpIndex} className="bg-muted/30">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-lg">{touchpointLabel}</CardTitle>
                            {touchpointResult.flaggedIssues && touchpointResult.flaggedIssues.length > 0 && (
                              <Badge variant="destructive">Issues</Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRegenerateTouchpoint(touchpointResult.touchpoint)}
                            disabled={isRegenerating}
                            className="gap-1.5 text-muted-foreground hover:text-foreground bg-background/50 hover:bg-background/80"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                            {isRegenerating ? 'Generating...' : 'Re-Generate'}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {touchpointResult.variations.map((variation, vIndex) => {
                          const hasIssues = variation.flaggedIssues && variation.flaggedIssues.length > 0
                          const variationKey = `${touchpointResult.touchpoint}-${JSON.stringify(variation)}`
                          const isLiked = likedVariations.has(variationKey)

                          return (
                            <div
                              key={vIndex}
                              className={`border rounded-lg p-4 space-y-3 bg-card hover:bg-accent/5 transition-colors ${hasIssues ? 'border-destructive' : ''}`}
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={`text-sm font-medium ${hasIssues ? 'text-destructive' : 'text-muted-foreground'}`}
                                >
                                  Variation {vIndex + 1}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    handleLikeVariation(variation, touchpointResult.touchpoint, touchpointLabel)
                                  }
                                >
                                  <Heart className={`h-4 w-4 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                                </Button>
                              </div>

                              {variation.subject && (
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">Subject</span>
                                    <span className="text-xs text-muted-foreground/70">
                                      ({variation.subject.length} chars)
                                    </span>
                                  </div>
                                  <div className="text-sm">{variation.subject}</div>
                                </div>
                              )}

                              {variation.preheader && (
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">Preheader</span>
                                    <span className="text-xs text-muted-foreground/70">
                                      ({variation.preheader.length} chars)
                                    </span>
                                  </div>
                                  <div className="text-sm">{variation.preheader}</div>
                                </div>
                              )}

                              {variation.snippet && (
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">Snippet</span>
                                    <span className="text-xs text-muted-foreground/70">
                                      ({variation.snippet.length} chars)
                                    </span>
                                  </div>
                                  <div className="text-sm">{variation.snippet}</div>
                                </div>
                              )}

                              {variation.headline && (
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">Headline</span>
                                    <span className="text-xs text-muted-foreground/70">
                                      ({variation.headline.length} chars)
                                    </span>
                                  </div>
                                  <div className="font-medium">{variation.headline}</div>
                                </div>
                              )}

                              {variation.body && (
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">Body</span>
                                    <span className="text-xs text-muted-foreground/70">
                                      ({variation.body.length} chars)
                                    </span>
                                  </div>
                                  <div className="text-sm leading-relaxed">{variation.body}</div>
                                </div>
                              )}

                              {variation.fullText && (
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">Full Text</span>
                                    <span className="text-xs text-muted-foreground/70">
                                      ({variation.fullText.length} chars)
                                    </span>
                                  </div>
                                  <div className="text-sm leading-relaxed">{variation.fullText}</div>
                                </div>
                              )}

                              {hasIssues && (
                                <Alert variant="destructive" className="mt-3">
                                  <AlertCircle className="h-4 w-4" />
                                  <AlertDescription>
                                    <div className="space-y-1">
                                      {variation.flaggedIssues!.map((issue, index) => (
                                        <div key={index}>
                                          <p className="text-sm font-medium">{issue.message}</p>
                                          {issue.suggestion && (
                                            <p className="text-sm text-muted-foreground mt-1">
                                              → {issue.suggestion}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </AlertDescription>
                                </Alert>
                              )}
                            </div>
                          )
                        })}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {result.suggestions && result.suggestions.length > 0 && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>{result.suggestions[0]}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Keep the named export adiGen's App.tsx already imports.
export { CopyGeneratorPage as CopyGenerator }
export default CopyGeneratorPage
