import { Link } from 'react-router-dom'
import { CATEGORY_DISPLAY_NAME } from '@/running-japan'

export function Home() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
        {CATEGORY_DISPLAY_NAME}
      </h1>
      <p className="mt-2 text-neutral-500">adiGen v0 — Phase 2 scaffold</p>

      <div className="mt-8 grid gap-3">
        <Link
          to="/copy-generator"
          className="block rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-900 hover:border-neutral-300 hover:bg-neutral-50"
        >
          Copy Generator →
        </Link>
        <div className="block rounded-md border border-dashed border-neutral-200 px-4 py-3 text-sm text-neutral-400">
          Image Generation (coming in Phase 4)
        </div>
        <div className="block rounded-md border border-dashed border-neutral-200 px-4 py-3 text-sm text-neutral-400">
          Cropping Toolkit (coming in Phase 3)
        </div>
        <div className="block rounded-md border border-dashed border-neutral-200 px-4 py-3 text-sm text-neutral-400">
          Editor / Notebook (coming in Phase 5)
        </div>
      </div>
    </div>
  )
}
