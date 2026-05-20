import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { PRODUCTS } from '@/running-japan'
import { generateCopy } from '@/lib/copy-agents/copyGenerator'
import type { CopyGenerationResponse, FlaggedIssue } from '@/lib/copy-agents/types'
import { useAuth } from '@/contexts/AuthContext'

interface Touchpoint {
  id: string
  label: string
  group: string
}

const TOUCHPOINTS: Touchpoint[] = [
  { id: 'hp-banner-hero', label: 'Homepage Hero Banner', group: 'Homepage' },
  { id: 'plp-banner-statement', label: 'PLP Statement Banner', group: 'PLP' },
  { id: 'pdp-headline', label: 'PDP Headline', group: 'PDP' },
  { id: 'email-subject', label: 'Email Subject', group: 'Email' },
  { id: 'push-notification', label: 'Push Notification', group: 'Push' },
  { id: 'app-drop-card', label: 'App Drop Card', group: 'App' },
]

export function CopyGenerator() {
  const { user, loading: authLoading } = useAuth()
  const [prompt, setPrompt] = useState('')
  const [productId, setProductId] = useState<string>('')
  const [touchpointIds, setTouchpointIds] = useState<string[]>(['hp-banner-hero'])

  const mutation = useMutation<CopyGenerationResponse>({
    mutationFn: () =>
      generateCopy({
        prompt,
        productInfo: productId
          ? (() => {
              const p = PRODUCTS.find((x) => x.id === productId)
              return p ? { name: p.name, category: p.category } : undefined
            })()
          : undefined,
        config: {
          touchpoints: touchpointIds,
          productId: productId || undefined,
          variationsPerTouchpoint: 4,
        },
      }),
  })

  const toggleTouchpoint = (id: string) => {
    setTouchpointIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || touchpointIds.length === 0) return
    mutation.mutate()
  }

  if (authLoading) return <p className="text-neutral-500">Loading…</p>

  if (!user) {
    return (
      <div className="max-w-xl rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Sign in to generate copy. (Auth flow not yet built — Phase 2 wiring pending Supabase credentials.)
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Copy Generator</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Generate brand-compliant copy across touchpoints for adidas Running Japan.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-neutral-900">Product</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">No specific product</option>
            {PRODUCTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="block text-sm font-medium text-neutral-900">Touchpoints</span>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TOUCHPOINTS.map((tp) => (
              <label
                key={tp.id}
                className="flex items-start gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm has-checked:border-neutral-900 has-checked:bg-neutral-900 has-checked:text-white"
              >
                <input
                  type="checkbox"
                  checked={touchpointIds.includes(tp.id)}
                  onChange={() => toggleTouchpoint(tp.id)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-xs opacity-70">{tp.group}</span>
                  {tp.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-900">Brief</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="Describe the campaign or the message you want to communicate."
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={mutation.isPending || !prompt.trim() || touchpointIds.length === 0}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? 'Generating…' : 'Generate'}
        </button>
      </form>

      {mutation.isError && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {(mutation.error as Error).message}
        </div>
      )}

      {mutation.data && <Results data={mutation.data} />}
    </div>
  )
}

function Results({ data }: { data: CopyGenerationResponse }) {
  return (
    <div className="mt-10 space-y-6">
      {data.results.map((tp) => (
        <section key={tp.touchpoint} className="rounded-md border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {tp.touchpoint}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {tp.variations.map((v, idx) => (
              <article key={idx} className="rounded border border-neutral-200 p-3 text-sm">
                {v.headline && <p className="font-semibold text-neutral-900">{v.headline}</p>}
                {v.body && <p className="mt-1 text-neutral-700">{v.body}</p>}
                {v.subject && (
                  <p className="mt-1 text-neutral-700">
                    <span className="text-xs uppercase text-neutral-500">Subject: </span>
                    {v.subject}
                  </p>
                )}
                {v.preheader && (
                  <p className="mt-1 text-neutral-700">
                    <span className="text-xs uppercase text-neutral-500">Preheader: </span>
                    {v.preheader}
                  </p>
                )}
                {v.snippet && (
                  <p className="mt-1 text-neutral-700">
                    <span className="text-xs uppercase text-neutral-500">Snippet: </span>
                    {v.snippet}
                  </p>
                )}
                {v.flaggedIssues && v.flaggedIssues.length > 0 && <Issues issues={v.flaggedIssues} />}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function Issues({ issues }: { issues: FlaggedIssue[] }) {
  return (
    <ul className="mt-2 space-y-1 border-t border-neutral-100 pt-2">
      {issues.map((issue, i) => (
        <li key={i} className="text-xs text-red-700">
          <span className="font-semibold uppercase">{issue.type}</span>: {issue.message}
        </li>
      ))}
    </ul>
  )
}
