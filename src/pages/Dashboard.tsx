// Adapted from bball repo (src/pages/Dashboard.tsx).
//
// Deltas vs bball:
//   - RecentCreationsGallery + PhotographyTypeSelection components aren't ported
//     yet (RecentCreationsGallery is heavy; PhotographyTypeSelection has bball
//     campaign hero imagery). v1 dashboard is a minimal grid of links to the
//     in-scope tools.
//   - Once the recent-creations gallery component is ported, swap the link
//     grid for the bball pattern.

import { Link } from 'react-router-dom'
import { CATEGORY_DISPLAY_NAME } from '@/running-japan'
import { Image, FileText, Crop } from 'lucide-react'

const tools = [
  {
    href: '/image-creation',
    title: 'Image Creation',
    description: 'Generate lifestyle and product images.',
    icon: Image,
  },
  {
    href: '/copy-generator',
    title: 'Copy Generator',
    description: 'AI-generated marketing copy for campaign touchpoints.',
    icon: FileText,
  },
  {
    href: '/toolkit',
    title: 'Cropping Toolkit',
    description: 'Smart-crop campaign assets to every touchpoint size.',
    icon: Crop,
  },
]

const Dashboard = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">{CATEGORY_DISPLAY_NAME}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            to={tool.href}
            className="group bg-card border border-border rounded-lg p-6 hover:border-foreground/30 hover:shadow-md transition-all"
          >
            <tool.icon className="h-6 w-6 text-foreground/70 group-hover:text-foreground" />
            <h2 className="font-semibold text-lg mt-3">{tool.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{tool.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default Dashboard
