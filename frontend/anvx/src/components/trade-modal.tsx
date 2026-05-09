// src/components/trade/TradeModal.tsx

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/axios'
import type { SecurityDetail } from '@/hooks/useSecurity'
import type { Position } from '@/hooks/usePortfolio'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface TradeModalProps {
  open:      boolean
  onClose:   () => void
  security:  SecurityDetail
  position?: Position
  initialSide?: 'buy' | 'sell'
}

const SPREAD     = 0.001
const COMMISSION = 0.001

const fmt = (n: number) =>
  n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function TradeModal({
  open,
  onClose,
  security,
  position,
  initialSide = 'buy',
}: TradeModalProps) {
  const queryClient = useQueryClient()

  const [side, setSide]   = useState<'buy' | 'sell'>(initialSide)
  const [lots, setLots]   = useState(1)
  const [error, setError] = useState<string | null>(null)

  // сбрасываем при открытии
  useEffect(() => {
    if (open) {
      setSide(initialSide)
      setLots(1)
      setError(null)
    }
  }, [open, initialSide])

  const price    = security.price ?? 0
  const execPrice = side === 'buy' ? price * (1 + SPREAD) : price * (1 - SPREAD)
  const shares    = lots * security.lot_size
  const subtotal  = execPrice * shares
  const commission = subtotal * COMMISSION
  const total      = side === 'buy' ? subtotal + commission : subtotal - commission

  const maxLots = position
    ? Math.floor(position.quantity / security.lot_size)
    : 0

  const mutation = useMutation({
    mutationFn: () => api.post('/trade', {
      ticker:    security.ticker,
      direction: side,
      quantity:  shares,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      onClose()
    },
    onError: (err: any) => {
      setError(err.response?.data?.error ?? 'Ошибка исполнения заявки')
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{security.ticker} — {security.short_name}</DialogTitle>
          <DialogDescription>
            Текущая цена: {fmt(price)} {security.currency}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

          {/* buy / sell switcher */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={side === 'buy' ? 'default' : 'outline'}
              className={side === 'buy' ? 'bg-green-600 hover:bg-green-700' : ''}
              onClick={() => { setSide('buy'); setError(null) }}
            >
              ▲ Купить
            </Button>
            <Button
              variant={side === 'sell' ? 'default' : 'outline'}
              className={side === 'sell' ? 'bg-red-600 hover:bg-red-700' : ''}
              onClick={() => { setSide('sell'); setError(null) }}
              disabled={!position || position.quantity === 0}
            >
              ▼ Продать
            </Button>
          </div>

          {/* лоты */}
          <div className="space-y-1">
            <Label>Лотов (1 лот = {security.lot_size} акц.)</Label>
            <div className="flex gap-2">
              <Button
                variant="outline" size="icon"
                onClick={() => setLots((l) => Math.max(1, l - 1))}
              >−</Button>
              <Input
                type="number"
                min={1}
                max={side === 'sell' ? maxLots : undefined}
                value={lots}
                onChange={(e) => setLots(Math.max(1, parseInt(e.target.value) || 1))}
                className="text-center"
              />
              <Button
                variant="outline" size="icon"
                onClick={() => setLots((l) => l + 1)}
              >+</Button>
            </div>
            {side === 'sell' && position && (
              <p className="text-xs text-muted-foreground">
                Доступно: {maxLots} лот(ов) ({position.quantity} шт.)
              </p>
            )}
          </div>

          {/* расчёт */}
          <div className="rounded-md border p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Цена исполнения</span>
              <span>{fmt(execPrice)} ₽</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Акций</span>
              <span>{shares} шт.</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Спред (0.1%)</span>
              <span>{side === 'buy' ? '+' : '-'}{fmt(Math.abs(execPrice - price) * shares)} ₽</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Комиссия (0.1%)</span>
              <span>{fmt(commission)} ₽</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>Итого</span>
              <span>{fmt(total)} ₽</span>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            disabled={mutation.isPending || (side === 'sell' && maxLots === 0)}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? 'Исполнение...'
              : side === 'buy'
                ? `Купить на ${fmt(total)} ₽`
                : `Продать на ${fmt(total)} ₽`
            }
          </Button>

        </div>
      </DialogContent>
    </Dialog>
  )
}