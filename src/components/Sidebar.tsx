// Adapted from bball repo (src/components/Sidebar.tsx).
//
// Deltas vs bball:
//   - Nav items dropped: Projects (not in adiGen v1 scope).
//   - Cropping Toolkit added (not in bball's nav).
//   - "adiGen / <category>" wordmark in place of bball's custom SVG logo.
//
// Behavior matches bball: collapse-on-narrow-viewport (<1300px) to a 64-px
// icon strip; hovering the strip expands to full width with a shadow; each
// nav item shows a Radix tooltip when in the collapsed state.

import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Image, FileText, Crop, BookOpen, PenTool, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { CATEGORY_DISPLAY_NAME } from '@/running-japan'
import { useIsSidebarCollapsed } from '@/hooks/use-mobile'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Image Creation', href: '/image-creation', icon: Image },
  { name: 'Editor', href: '/editor', icon: PenTool },
  { name: 'Gallery', href: '/gallery', icon: Image },
  { name: 'Copy Generator', href: '/copy-generator', icon: FileText },
  { name: 'Notebook', href: '/notebook', icon: BookOpen },
  { name: 'Cropping Toolkit', href: '/toolkit', icon: Crop },
]

const Sidebar = () => {
  const { logout } = useAuth()
  const isCollapsed = useIsSidebarCollapsed()
  const [isHovered, setIsHovered] = useState(false)

  const shouldShowExpanded = !isCollapsed || isHovered

  const NavItem = ({ item }: { item: (typeof navigation)[number] }) => {
    const content = (
      <NavLink
        to={item.href}
        className={({ isActive }) =>
          cn(
            'flex items-center px-3 py-2 text-sm md:text-base font-medium rounded-md transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            !shouldShowExpanded && 'justify-center',
          )
        }
      >
        <item.icon className={cn('h-4 w-4', shouldShowExpanded && 'mr-3')} />
        {shouldShowExpanded && <span>{item.name}</span>}
      </NavLink>
    )

    if (isCollapsed && !isHovered) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right">
            <p>{item.name}</p>
          </TooltipContent>
        </Tooltip>
      )
    }

    return content
  }

  return (
    <TooltipProvider>
      <div
        className={cn(
          'bg-card border-r border-border flex flex-col h-screen transition-all duration-300 ease-in-out relative',
          isCollapsed ? 'w-16' : 'w-64',
          isCollapsed && isHovered && 'w-64 shadow-lg z-50',
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className={cn('p-6', !shouldShowExpanded && 'p-4')}>
          {shouldShowExpanded ? (
            <div className="text-sm font-semibold tracking-tight text-foreground text-center">
              adiGen
              <div className="text-xs font-normal text-muted-foreground mt-0.5">{CATEGORY_DISPLAY_NAME}</div>
            </div>
          ) : (
            <div className="text-sm font-semibold tracking-tight text-foreground text-center">aG</div>
          )}
        </div>
        <nav className="flex-1 px-4 space-y-2 overflow-hidden">
          {navigation.map((item) => (
            <NavItem key={item.name} item={item} />
          ))}
        </nav>
        <div className={cn('p-6 mt-auto', !shouldShowExpanded && 'p-4')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={logout}
                className={cn(
                  'flex items-center w-full px-3 py-2 text-sm font-medium rounded-md transition-colors bg-card hover:bg-accent hover:text-accent-foreground text-muted-foreground',
                  !shouldShowExpanded && 'justify-center',
                )}
              >
                <LogOut className={cn('h-4 w-4', shouldShowExpanded && 'mr-3')} />
                {shouldShowExpanded && <span>Logout</span>}
              </button>
            </TooltipTrigger>
            {isCollapsed && !isHovered && (
              <TooltipContent side="right">
                <p>Logout</p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}

export default Sidebar
