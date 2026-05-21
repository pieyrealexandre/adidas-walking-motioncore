// Adapted from bball repo (src/hooks/useReferenceImages.ts).
//
// Deltas vs bball:
//   - bball's hook delegates to a global AppState context (addReferenceFile /
//     clearReferenceFiles). adiGen doesn't have AppStateContext, so this
//     version keeps its own state and returns it.
//   - Adds `eq('category', CATEGORY_SLUG)` to the query for v1 isolation.

import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { CATEGORY_SLUG } from '@/running-japan'

export interface ReferenceImageFile {
  id: string
  name: string
  type: string
  size: number
  url: string
  uploadedAt: Date
}

export const useReferenceImages = () => {
  const [referenceImages, setReferenceImages] = useState<ReferenceImageFile[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from('reference_images')
          .select('*')
          .eq('category', CATEGORY_SLUG)
          .order('created_at', { ascending: false })

        if (error) return
        if (!data) return

        setReferenceImages(
          data.map((image: any) => ({
            id: image.id,
            name: image.name,
            type: image.mime_type,
            size: image.size,
            url: image.url,
            uploadedAt: new Date(image.created_at),
          })),
        )
      } catch {
        // swallow — empty referenceImages is a fine fallback
      }
    }
    load()
  }, [])

  return { referenceImages }
}
