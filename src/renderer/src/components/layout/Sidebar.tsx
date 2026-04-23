import { NavLink } from 'react-router-dom'
import { Home, List, Calendar, Upload, BarChart2, Settings } from 'lucide-react'
import { cn } from '../../lib/utils'

const NAV_ITEMS = [
  { to: '/',          label: 'Home',       icon: Home },
  { to: '/campaigns', label: 'Campaigns',  icon: List },
  { to: '/timeline',  label: 'Timeline',   icon: Calendar },
  { to: '/import',    label: 'Import',     icon: Upload },
  { to: '/dashboard', label: 'Dashboard',  icon: BarChart2 },
  { to: '/settings',  label: 'Settings',   icon: Settings },
]

export default function Sidebar() {
  return (
    <aside className="w-52 flex-shrink-0 border-r border-border bg-card flex flex-col py-4">
      <div className="px-4 mb-6">
        <h1 className="text-sm font-semibold text-foreground">Campaign Tracker</h1>
        <p className="text-xs text-muted-foreground">TTD Ad Operations</p>
      </div>
      <nav className="flex flex-col gap-1 px-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}