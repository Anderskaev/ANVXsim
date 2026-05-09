// src/components/layout/Navbar.tsx

import { NavLink } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'

const links = [
  { to: '/market', label: 'Рынок' },
  { to: '/portfolio', label: 'Портфель' },
  { to: '/history', label: 'История' },
]

export function Navbar() {
  const { logout } = useAuthStore()

  return (
    <aside className="flex flex-col h-full p-4 gap-6">

      {/* лого */}
      <div className="flex items-center justify-between px-5 pt-2 pb-[10px] shrink-0">
        <div className="logo-text">ANVX
          <span>sim</span>
        </div>
      </div>

      {/* навигация */}
      <nav className="flex flex-col gap-1 flex-1">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* портфель + пользователь */}
      <div className="space-y-3 border-t pt-4">

        <div className="px-2 space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start px-0 text-muted-foreground"
            onClick={logout}
          >
            Выйти
          </Button>
        </div>
      </div>

    </aside>
  )
}