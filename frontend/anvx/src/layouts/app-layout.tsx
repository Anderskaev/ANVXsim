import { Outlet } from 'react-router'
import { MobileLayout } from "./mobile-layout"
import { DesktopLayout } from "./desktop-layout"
import { useIsMobile } from "@/hooks/useIsMobile"

export function AppLayout() {
  const isMobile = useIsMobile()

  return isMobile
    ? <MobileLayout><Outlet /></MobileLayout>
    : <DesktopLayout><Outlet /></DesktopLayout>
}