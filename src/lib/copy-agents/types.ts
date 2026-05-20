export interface ProductOption {
  id: string
  name: string
  franchise: string
  category: string
  tagline?: string
}

export interface CopyGenerationConfig {
  touchpoints: string[]
  productId?: string
  formatType?: string
  variationsPerTouchpoint?: number
  characterLimit?: number
  enableCharacterLimit?: boolean
}

export interface CopyGenerationRequest {
  prompt: string
  context?: string
  productInfo?: {
    name: string
    category: string
    features?: string[]
  }
  config: CopyGenerationConfig
}

export type FlaggedIssueType =
  | 'brand-violation'
  | 'word-avoidance'
  | 'naming-error'
  | 'trademark'
  | 'legal'

export interface FlaggedIssue {
  type: FlaggedIssueType
  message: string
  suggestion?: string
}

export interface CopyVariation {
  headline?: string
  body?: string
  subject?: string
  preheader?: string
  snippet?: string
  characterCount: number
  flaggedIssues?: FlaggedIssue[]
}

export interface TouchpointResult {
  touchpoint: string
  variations: CopyVariation[]
  flaggedIssues?: FlaggedIssue[]
}

export interface CopyGenerationResponse {
  results: TouchpointResult[]
  withinLimit: boolean
  suggestions?: string[]
}
