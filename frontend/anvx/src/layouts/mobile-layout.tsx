import { BottomNav } from "@/components/layouts/bottomnav"

export function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between px-5 pt-2 pb-[10px] shrink-0">
        <div className="logo-text">ANVX
          <span>sim</span>
        </div>
      </div>      
      <main className="flex-1 overflow-auto pb-16">
        {children}
      </main>
       <BottomNav />
    </div>
  )
}