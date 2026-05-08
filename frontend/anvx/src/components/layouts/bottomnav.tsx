import { NavLink } from 'react-router'

const links = [
  { to: '/market', label: 'Рынок', icon: '📈' },
  { to: '/portfolio', label: 'Портфель', icon: '💼' },
  { to: '/history', label: 'История', icon: '🕐' },
]

export function BottomNav() {
  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-background">
        {links.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${isActive
                ? 'text-primary'
                : 'text-muted-foreground'
              }`
            }
          >
            <span className="text-xl leading-none">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}