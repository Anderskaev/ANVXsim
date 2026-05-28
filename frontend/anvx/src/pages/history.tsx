// src/pages/History.tsx

import { useEffect, useRef, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import api from '@/lib/axios'
import { useState } from 'react'
import { format } from 'date-fns'
import { ru }     from 'date-fns/locale'
import { Badge }  from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

// ── TYPES ─────────────────────────────────────────────────────────────────────

interface HistoryItem {
  item_type:   'trade' | 'accrual'
  id:          number
  ticker:      string
  direction?:  'buy' | 'sell'
  type?:       'dividend' | 'coupon' | 'amortization'
  quantity?:   number
  price?:      number
  amount?:     number
  total?:      number
  executed_at?: string
  accrued_at?:  string
}

interface HistoryPage {
  items:    HistoryItem[]
  page:     number
  pages:    number
  total:    number
  has_next: boolean
}

// ── FILTER TYPES ──────────────────────────────────────────────────────────────

const FILTERS = [
  { value: '',         label: 'Все'       },
  { value: 'trade',    label: 'Сделки'    },
  { value: 'dividend', label: 'Дивиденды' },
  { value: 'coupon',   label: 'Купоны'    },
]

// ── HELPERS ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null, d = 2) =>
  n == null
    ? '—'
    : n.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d })

const fmtDate = (s: string) =>
  format(new Date(s), 'd MMM yyyy, HH:mm', { locale: ru })

function getItemMeta(item: HistoryItem): {
  icon:    string
  label:   string
  sublabel: string
  amount:  number
  positive: boolean
  badgeVariant: 'default' | 'destructive' | 'secondary' | 'outline'
  badgeClass: string
} {
  if (item.item_type === 'trade') {
    const isBuy = item.direction === 'buy'
    return {
      icon:         isBuy ? '▲' : '▼',
      label:        `${item.ticker} · ${isBuy ? 'Покупка' : 'Продажа'}`,
      sublabel:     `${item.quantity} шт. × ${fmt(item.price || 0)} ₽`,
      amount:       item.total ?? 0,
      positive:     !isBuy,
      badgeVariant: isBuy ? 'secondary' : 'destructive',
      badgeClass:   isBuy
        ? 'bg-blue-500/15 text-blue-600 hover:bg-blue-500/15'
        : '',
    }
  }

  const typeLabel = {
    dividend:     'Дивиденды',
    coupon:       'Купон',
    amortization: 'Амортизация',
  }[item.type ?? 'dividend'] ?? ''

  return {
    icon:         '✦',
    label:        `${item.ticker} · ${typeLabel}`,
    sublabel:     `${item.quantity} шт.`,
    amount:       item.amount ?? 0,
    positive:     true,
    badgeVariant: 'default',
    badgeClass:   'bg-green-500/15 text-green-600 hover:bg-green-500/15',
  }
}

// ── HISTORY ITEM ──────────────────────────────────────────────────────────────

function HistoryCard({ item }: { item: HistoryItem }) {
  const meta = getItemMeta(item)
  const date = item.executed_at ?? item.accrued_at ?? ''

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
      {/* иконка */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm shrink-0 ${
        item.item_type === 'trade' && item.direction === 'buy'
          ? 'bg-blue-500/10 text-blue-500'
          : item.item_type === 'trade'
            ? 'bg-red-500/10 text-red-500'
            : 'bg-green-500/10 text-green-500'
      }`}>
        {meta.icon}
      </div>

      {/* инфо */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{meta.label}</p>
        <p className="text-xs text-muted-foreground">{meta.sublabel}</p>
        {date && (
          <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(date)}</p>
        )}
      </div>

      {/* сумма */}
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold ${meta.positive ? 'text-green-500' : 'text-red-500'}`}>
          {meta.positive ? '+' : '-'}{fmt(meta.amount, 0)} ₽
        </p>
        <Badge
          variant={meta.badgeVariant}
          className={`text-xs mt-1 ${meta.badgeClass}`}
        >
          {item.item_type === 'trade'
            ? item.direction === 'buy' ? 'Покупка' : 'Продажа'
            : meta.label.split('·')[1]?.trim()
          }
        </Badge>
      </div>
    </div>
  )
}

// ── SKELETON ──────────────────────────────────────────────────────────────────

function HistorySkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b">
          <Skeleton className="w-9 h-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </>
  )
}

// ── HISTORY PAGE ──────────────────────────────────────────────────────────────

export function History() {
  const [filter, setFilter]   = useState('')
  const loaderRef             = useRef<HTMLDivElement>(null)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<HistoryPage>({
    queryKey:  ['history', filter],
    queryFn:   ({ pageParam = 1 }) =>
      api.get('/portfolio/history', {
        params: { page: pageParam, type: filter, limit: 20 },
      }).then((r) => r.data),
    getNextPageParam: (last) => last.has_next ? last.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 30_000,
  })

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0

  // ── infinite scroll ───────────────────────────────────────
  const onIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  useEffect(() => {
    const el = loaderRef.current
    if (!el) return
    const observer = new IntersectionObserver(onIntersect, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onIntersect])

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* заголовок */}
      <div>
        <h1 className="text-xl font-bold">История</h1>
        {total > 0 && (
          <p className="text-sm text-muted-foreground">{total} операций</p>
        )}
      </div>

      {/* фильтры */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
              filter === f.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* контент */}
      <div className="rounded-lg border overflow-hidden">
        {isLoading ? (
          <HistorySkeleton />
        ) : items.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">
            Операций нет
          </div>
        ) : (
          items.map((item) => (
            <HistoryCard key={`${item.item_type}-${item.id}`} item={item} />
          ))
        )}
      </div>

      {/* infinite scroll триггер */}
      <div ref={loaderRef} className="h-8 flex items-center justify-center">
        {isFetchingNextPage && (
          <span className="text-xs text-muted-foreground">Загрузка...</span>
        )}
      </div>

    </div>
  )
}