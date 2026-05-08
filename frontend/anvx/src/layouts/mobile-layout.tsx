import { BottomNav } from "@/components/layouts/bottomnav"
import { useAuthStore } from "@/store/auth.store"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import { HugeiconsIcon } from '@hugeicons/react'
import { Sun03Icon, Moon02Icon } from "@hugeicons/core-free-icons"

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme()
  const { logout } = useAuthStore()
  
  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between px-5 pt-2 pb-[10px] shrink-0">
        <div className="logo-text">ANVX
          <span>sim</span>
        </div>
        <div className="flex item-center gap-2">
          <Button onClick={logout} variant="ghost" size="sm" className="px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50">
            Выйти
          </Button>
          <Button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} variant="outline" size="sm" className="px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50">
            <HugeiconsIcon icon={theme === "dark" ? Sun03Icon : Moon02Icon} />
          </Button>          
        </div>
      </div>
      <main className="flex-1 overflow-auto pb-16">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}