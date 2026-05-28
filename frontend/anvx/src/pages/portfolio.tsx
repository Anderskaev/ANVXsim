// src/pages/Portfolio.tsx

import { useNavigate } from 'react-router-dom'
import { usePortfolio } from '@/hooks/usePortfolio'
import { useAuthStore } from '@/store/auth.store'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { type Position } from '@/hooks/usePortfolio'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── HELPERS ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null, d = 2) =>
  n == null
    ? '—'
    : n.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d })

// ── STAT CARD ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, positive }: {
  label:     string
  value:     string
  sub?:      string
  positive?: boolean
}) {
  const color =
    positive === undefined
      ? ''
      : positive
        ? 'text-green-500'
        : 'text-red-500'

  return (
    <div className="rounded-lg border p-4 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className={`text-xs ${color}`}>{sub}</p>}
    </div>
  )
}

// ── DEPOSIT MODAL ─────────────────────────────────────────────────────────────

function DepositModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [error,  setError]  = useState<string | null>(null)

  const PRESETS = [10_000, 50_000, 100_000, 500_000]

  const mutation = useMutation({
    mutationFn: (amt: number) => api.post('/portfolio/deposit', { amount: amt }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      // обновляем cash в auth store
      useAuthStore.getState().setAuth(
        useAuthStore.getState().user!,
        { ...useAuthStore.getState().portfolio!, cash: res.data.cash }
      )
      onClose()
      setAmount('')
      setError(null)
    },
    onError: (err: any) => {
      setError(err.response?.data?.error ?? 'Ошибка пополнения')
    },
  })

  const handleSubmit = () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Введите положительную сумму'); return }
    mutation.mutate(amt)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Пополнить счёт</DialogTitle>
          <DialogDescription>
            Виртуальное пополнение — деньги реальные не списываются
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p}
                variant="outline"
                size="sm"
                onClick={() => setAmount(String(p))}
              >
                +{p.toLocaleString('ru-RU')} ₽
              </Button>
            ))}
          </div>
          <div className="space-y-1">
            <Label>Своя сумма</Label>
            <Input
              type="number"
              placeholder="0"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null) }}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Пополнение...' : 'Пополнить'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── POSITIONS TABLE (desktop) ─────────────────────────────────────────────────

function PositionsTable({ positions, onRowClick }: {
  positions:  Position[]
  onRowClick: (ticker: string) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Тикер</TableHead>
          <TableHead>Название</TableHead>
          <TableHead className="text-right">Кол-во</TableHead>
          <TableHead className="text-right">Ср. цена</TableHead>
          <TableHead className="text-right">Тек. цена</TableHead>
          <TableHead className="text-right">P&L, ₽</TableHead>
          <TableHead className="text-right">P&L, %</TableHead>
          <TableHead className="text-right">Стоимость</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((pos: Position) => {
          const positive = pos.pnl >= 0
          return (
            <TableRow
              key={pos.ticker}
              className="cursor-pointer"
              onClick={() => onRowClick(pos.ticker)}
            >
              <TableCell className="font-mono font-semibold text-primary">
                {pos.ticker}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {pos.short_name}
              </TableCell>
              <TableCell className="text-right font-mono">{pos.quantity}</TableCell>
              <TableCell className="text-right font-mono">{fmt(pos.avg_price)}</TableCell>
              <TableCell className="text-right font-mono">{fmt(pos.current_price)}</TableCell>
              <TableCell className={`text-right font-mono font-medium ${positive ? 'text-green-500' : 'text-red-500'}`}>
                {positive ? '+' : ''}{fmt(pos.pnl, 0)}
              </TableCell>
              <TableCell className={`text-right ${positive ? 'text-green-500' : 'text-red-500'}`}>
                <Badge
                  variant={positive ? 'default' : 'destructive'}
                  className={positive ? 'bg-green-500/15 text-green-600 hover:bg-green-500/15' : ''}
                >
                  {positive ? '+' : ''}{fmt(pos.pnl_pct)}%
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono">
                {fmt(pos.value, 0)} ₽
              </TableCell>
            </TableRow>
          )
        })}
        {positions.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
              Нет открытых позиций
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

// ── POSITIONS MOBILE ──────────────────────────────────────────────────────────

function PositionsMobile({ positions, onRowClick }: {
  positions:  Position[]
  onRowClick: (ticker: string) => void
}) {
  if (!positions.length) return (
    <div className="text-center text-muted-foreground py-12 text-sm">
      Нет открытых позиций
    </div>
  )

  return (
    <div className="divide-y">
      {positions.map((pos: Position) => {
        const positive = pos.pnl >= 0
        return (
          <div
            key={pos.ticker}
            className="flex items-center justify-between px-4 py-3 cursor-pointer active:bg-accent/50"
            onClick={() => onRowClick(pos.ticker)}
          >
            <div className="min-w-0">
              <p className="font-mono font-semibold text-sm">{pos.ticker}</p>
              <p className="text-xs text-muted-foreground">{pos.short_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pos.quantity} шт. · ср. {fmt(pos.avg_price)}
              </p>
            </div>
            <div className="text-right shrink-0 ml-4 space-y-1">
              <p className="font-mono text-sm font-medium">{fmt(pos.value, 0)} ₽</p>
              <Badge
                variant={positive ? 'default' : 'destructive'}
                className={positive ? 'bg-green-500/15 text-green-600 hover:bg-green-500/15' : ''}
              >
                {positive ? '+' : ''}{fmt(pos.pnl_pct)}%
              </Badge>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── PORTFOLIO PAGE ────────────────────────────────────────────────────────────

export function PortfolioComp() {
  const navigate        = useNavigate()
  const isMobile        = useIsMobile()
  const [depositOpen, setDepositOpen] = useState(false)

  const { data, isLoading } = usePortfolio()

  if (isLoading) return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  )

  if (!data) return null

  const { portfolio, positions, total_value, pos_value, total_pnl, roi } = data
  const positive = total_pnl >= 0

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* заголовок */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Портфель</h1>
        <Button size="sm" variant="outline" onClick={() => setDepositOpen(true)}>
          + Пополнить
        </Button>
      </div>

      {/* статы */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Стоимость"
          value={`₽ ${fmt(total_value, 0)}`}
        />
        <StatCard
          label="Позиции"
          value={`₽ ${fmt(pos_value, 0)}`}
        />
        <StatCard
          label="Свободно"
          value={`₽ ${fmt(portfolio.cash, 0)}`}
          positive={true}
        />
        <StatCard
          label="P&L"
          value={`${positive ? '+' : ''}₽ ${fmt(total_pnl, 0)}`}
          sub={`${positive ? '+' : ''}${fmt(roi)}%`}
          positive={positive}
        />
      </div>

      {/* позиции */}
      <div className="rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm font-semibold">
            Позиции
            {positions.length > 0 && (
              <span className="text-muted-foreground font-normal ml-2">
                {positions.length}
              </span>
            )}
          </p>
        </div>
        {isMobile
          ? <PositionsMobile positions={positions} onRowClick={(t) => navigate(`/market/${t}`)} />
          : <PositionsTable  positions={positions} onRowClick={(t) => navigate(`/market/${t}`)} />
        }
      </div>

      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />
    </div>
  )
}