//import { AuthLayout } from "./layouts/auth-layout"
import { Login } from "./pages/login"
import { Register } from "./pages/register"
import { PortfolioComp } from "./pages/portfolio"
import { History } from "./pages/history"

import { AppLayout } from "./layouts/app-layout"

import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { useAuthStore } from "./store/auth.store"
import { Market } from "./pages/market"

import api from '@/lib/axios'
import { useEffect, useState } from "react"

import {
  Item,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import Security from "./pages/security"

function AuthLayout({ children }: { children: React.ReactNode }) {
  const isAuth = useAuthStore((s) => s.isAuth)
  if (!isAuth) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10" >
        <div className="w-full max-w-sm">
          {children}
        </div>
      </div >
    )
  }
  else {
    return <Navigate to="/market" replace />
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuth = useAuthStore((s) => s.isAuth)
  return isAuth ? <>{children}</> : <Navigate to="/login" replace />
}

export function App() {
  const setAuth = useAuthStore((s) => s.setAuth)
  const logout = useAuthStore((s) => s.logout)
  const [isRestoring, setIsRestoring] = useState(true)

  useEffect(() => {
    const restoreSession = async () => {
      const accessToken = localStorage.getItem('access_token')
      if (!accessToken) {
        setIsRestoring(false)
        return
      }

      try {
        const { data } = await api.get('/auth/me')
        setAuth(data.user, data.portfolio)
      } catch {
        logout()
      } finally {
        setIsRestoring(false)
      }
    }
    restoreSession()
  }, [])

  if (isRestoring) {
    return (
      (
        <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10" >
          <div className="w-full max-w-sm">
            <div className="flex w-full max-w-xs flex-col gap-4 [--radius:1rem]">
              <Item variant="muted">
                <ItemMedia>
                  <Spinner />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="line-clamp-1">Loading...</ItemTitle>
                </ItemContent>
              </Item>
            </div>
          </div>
        </div >
      )
    )
  }

  return (
    <BrowserRouter>
      <Routes>

        <Route path="/login" element={<AuthLayout><Login /></AuthLayout>} />
        <Route path="/register" element={<AuthLayout><Register /></AuthLayout>} />

        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/market" element={<Market />} />
          <Route path="/market/:ticker" element={<Security />} />
          <Route path="/portfolio" element={<PortfolioComp />} />
          <Route path="/history" element={<History />} /> 
        </Route>

        <Route path="*" element={<Navigate to="/market" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
