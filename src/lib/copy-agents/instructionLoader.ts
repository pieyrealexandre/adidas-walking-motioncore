import adidasCopyGuide from '@instructions/ADIDAS_COPY_GUIDE.md?raw'
import brandGuidelines from '@instructions/brand-guidelines.md?raw'
import wordsToAvoid from '@instructions/words-to-avoid.md?raw'
import productNaming from '@instructions/product-naming.md?raw'
import supernovaGuidelines from '@instructions/products/supernova.md?raw'
import { copyGuidelines as runningJapanCopyGuidelines } from '@/running-japan'

const GLOBAL_INSTRUCTIONS = [
  adidasCopyGuide,
  brandGuidelines,
  wordsToAvoid,
  productNaming,
]

export const getEnabledInstructions = (): string => {
  return [...GLOBAL_INSTRUCTIONS, runningJapanCopyGuidelines].join('\n\n---\n\n')
}

const PRODUCT_GUIDELINES: Record<string, string> = {
  'supernova-rise': supernovaGuidelines,
  'supernova-prima': supernovaGuidelines,
  'supernova-stride': supernovaGuidelines,
  'supernova-solution': supernovaGuidelines,
  'supernova-gtx': supernovaGuidelines,
}

export const getProductGuidelines = (productId: string): string | null => {
  return PRODUCT_GUIDELINES[productId] ?? null
}

export const hasProductGuidelines = (productId: string): boolean => {
  return productId in PRODUCT_GUIDELINES
}
