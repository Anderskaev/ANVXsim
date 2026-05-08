import { Navbar } from "@/components/layouts/navbar"

export function DesktopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      {/* <aside className="w-64 border-r"> */}
         <Navbar /> 
      {/* </aside> */}
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  )
}