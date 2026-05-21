// Adapted from bball repo (src/components/Sidebar.tsx).
//
// Deltas vs bball:
//   - Nav items dropped: Projects, Editor, Notebook (not in adiGen v1 scope).
//   - Cropping Toolkit added (not in bball's nav).
//   - Always-expanded (no collapse-on-small + tooltip behavior). Tooltip would
//     need @radix-ui/react-tooltip — added later if/when we want the collapse UX.
//   - "adiGen / Running — Japan" wordmark in place of bball's custom SVG logo.

import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Image, FileText, Crop, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { CATEGORY_DISPLAY_NAME } from '@/running-japan'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Image Creation', href: '/image-creation', icon: Image },
  { name: 'Gallery', href: '/gallery', icon: Image },
  { name: 'Copy Generator', href: '/copy-generator', icon: FileText },
  { name: 'Cropping Toolkit', href: '/toolkit', icon: Crop },
]

const Sidebar = () => {
  const { logout } = useAuth()

  return (
    <div className="bg-card border-r border-border flex flex-col h-screen w-64">
      <div className="p-6">
        <div className="text-sm font-semibold tracking-tight text-foreground text-center">
          adiGen
          <div className="text-xs font-normal text-muted-foreground mt-0.5">{CATEGORY_DISPLAY_NAME}</div>
        </div>
      </div>
      <nav className="flex-1 px-4 space-y-2 overflow-hidden">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                'flex items-center px-3 py-2 text-sm md:text-base font-medium rounded-md transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )
            }
          >
            <item.icon className="h-4 w-4 mr-3" />
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-6 mt-auto">
        <button
          onClick={logout}
          className="flex items-center w-full px-3 py-2 text-sm font-medium rounded-md transition-colors bg-card hover:bg-accent hover:text-accent-foreground text-muted-foreground"
        >
          <LogOut className="h-4 w-4 mr-3" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  )
}

export default Sidebar
