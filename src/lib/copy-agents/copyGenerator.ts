import { supabase } from '@/integrations/supabase/client'
import { getEnabledInstructions, getProductGuidelines } from './instructionLoader'
import type {
  CopyGenerationConfig,
  CopyGenerationRequest,
  CopyGenerationResponse,
  CopyVariation,
  FlaggedIssue,
  TouchpointResult,
} from './types'

const WORDS_TO_AVOID = [
  'game changer', 'next level', 'bring your a-game', 'beast mode',
  'revolutionary', 'unprecedented', 'world-class', 'state-of-the-art',
  'amazing', 'incredible', 'awesome', 'epic', 'insane',
  'basically', 'simply', 'honestly', 'literally', 'actually',
]

const TRADEMARK_CLAIMS: Array<{ phrase: string; brand: string; type: 'tagline' | 'legal-claim' }> = [
  { phrase: 'just do it', brand: 'Nike', type: 'tagline' },
  { phrase: 'there is no finish line', brand: 'Nike', type: 'tagline' },
  { phrase: 'find your greatness', brand: 'Nike', type: 'tagline' },
  { phrase: 'i will', brand: 'Under Armour', type: 'tagline' },
  { phrase: 'protect this house', brand: 'Under Armour', type: 'tagline' },
  { phrase: 'forever faster', brand: 'Puma', type: 'tagline' },
  { phrase: 'fearlessly independent', brand: 'New Balance', type: 'tagline' },
  { phrase: 'run your way', brand: 'New Balance', type: 'tagline' },
  { phrase: 'sound mind sound body', brand: 'Asics', type: 'tagline' },
  { phrase: 'best in class', brand: 'Generic', type: 'legal-claim' },
  { phrase: 'number one', brand: 'Generic', type: 'legal-claim' },
  { phrase: '#1', brand: 'Generic', type: 'legal-claim' },
  { phrase: 'industry leading', brand: 'Generic', type: 'legal-claim' },
  { phrase: 'guaranteed', brand: 'Generic', type: 'legal-claim' },
  { phrase: 'scientifically proven', brand: 'Generic', type: 'legal-claim' },
  { phrase: 'clinically tested', brand: 'Generic', type: 'legal-claim' },
]

function buildSystemPrompt(touchpoint: string, productId: string | undefined): string {
  const parts: string[] = [getEnabledInstructions()]

  if (productId) {
    const productGuide = getProductGuidelines(productId)
    if (productGuide) parts.push(productGuide)
  }

  parts.push(`You are generating copy for touchpoint: ${touchpoint}.`)
  return parts.join('\n\n---\n\n')
}

function buildUserPrompt(request: CopyGenerationRequest, touchpoint: string): string {
  const lines: string[] = []
  lines.push(`Brief: ${request.prompt}`)

  if (request.productInfo) {
    lines.push(`Product: ${request.productInfo.name} (${request.productInfo.category})`)
    if (request.productInfo.features?.length) {
      lines.push(`Key features: ${request.productInfo.features.join(', ')}`)
    }
  }

  lines.push(`Touchpoint: ${touchpoint}`)
  lines.push(`Generate ${request.config.variationsPerTouchpoint ?? 4} distinct variations.`)
  lines.push('Format each as "Variation N:" followed by labelled fields (Headline:, Body:, Subject:, Preheader:, Snippet:).')
  return lines.join('\n')
}

function parseVariations(rawCopy: string): CopyVariation[] {
  const blocks = rawCopy
    .split(/\n\s*(?:\*\*)?Variation\s+\d+:?(?:\*\*)?\s*\n/i)
    .slice(1)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)

  return blocks.map((block) => parseFields(block))
}

function parseFields(block: string): CopyVariation {
  const variation: CopyVariation = { characterCount: 0 }
  const field = (label: string): string | undefined => {
    const re = new RegExp(`(?:\\*\\*)?${label}:?(?:\\*\\*)?\\s*([\\s\\S]*?)(?=\\n\\s*(?:\\*\\*)?(?:Headline|Body|Subject|Preheader|Snippet):|$)`, 'i')
    const match = block.match(re)
    return match?.[1]?.trim().replace(/^["']|["']$/g, '') || undefined
  }
  variation.headline = field('Headline')
  variation.body = field('Body')
  variation.subject = field('Subject')
  variation.preheader = field('Preheader')
  variation.snippet = field('Snippet')

  const all = [variation.headline, variation.body, variation.subject, variation.preheader, variation.snippet]
    .filter(Boolean)
    .join(' ')
  variation.characterCount = all.length
  return variation
}

function containsEmDash(variation: CopyVariation): boolean {
  const text = [variation.headline, variation.body, variation.subject, variation.preheader, variation.snippet]
    .filter(Boolean)
    .join(' ')
  return /—/.test(text)
}

function validateVariation(variation: CopyVariation, productName?: string): FlaggedIssue[] {
  const issues: FlaggedIssue[] = []
  const text = [variation.headline, variation.body, variation.subject, variation.preheader, variation.snippet]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  for (const word of WORDS_TO_AVOID) {
    if (text.includes(word)) {
      issues.push({
        type: 'word-avoidance',
        message: `Contains banned phrase: "${word}"`,
      })
    }
  }

  for (const claim of TRADEMARK_CLAIMS) {
    if (text.includes(claim.phrase)) {
      issues.push({
        type: claim.type === 'tagline' ? 'trademark' : 'legal',
        message: claim.type === 'tagline'
          ? `Matches ${claim.brand} tagline: "${claim.phrase}"`
          : `Unsupported claim: "${claim.phrase}"`,
      })
    }
  }

  if (containsEmDash(variation)) {
    issues.push({
      type: 'brand-violation',
      message: 'Contains em-dash (use a comma or period instead)',
    })
  }

  if (productName && variation.headline && variation.body) {
    const headlineHasProduct = variation.headline.toLowerCase().includes(productName)
    const bodyHasProduct = variation.body.toLowerCase().includes(productName)
    if (!headlineHasProduct && !bodyHasProduct) {
      issues.push({
        type: 'naming-error',
        message: `Product name "${productName}" missing from headline and body`,
      })
    }
  }

  return issues
}

async function generateForTouchpoint(
  request: CopyGenerationRequest,
  touchpoint: string,
): Promise<TouchpointResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No active session — sign in to generate copy.')

  const instructions = buildSystemPrompt(touchpoint, request.config.productId)
  const userPrompt = buildUserPrompt(request, touchpoint)

  const { data, error } = await supabase.functions.invoke('generate-copy', {
    body: {
      prompt: userPrompt,
      instructions,
      config: { ...request.config, touchpoint } satisfies CopyGenerationConfig & { touchpoint: string },
    },
  })

  if (error) throw error
  if (!data?.copy) throw new Error('Edge function returned no copy')

  const variations = parseVariations(data.copy)
  const productName = request.productInfo?.name?.toLowerCase()
  for (const variation of variations) {
    variation.flaggedIssues = validateVariation(variation, productName)
  }

  return { touchpoint, variations }
}

export async function generateCopy(
  request: CopyGenerationRequest,
): Promise<CopyGenerationResponse> {
  const touchpoints = request.config.touchpoints
  if (!touchpoints.length) {
    throw new Error('At least one touchpoint must be selected')
  }

  const results: TouchpointResult[] = []
  for (const touchpoint of touchpoints) {
    const result = await generateForTouchpoint(request, touchpoint)
    results.push(result)
    if (touchpoints.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500))
    }
  }

  return { results, withinLimit: true }
}
