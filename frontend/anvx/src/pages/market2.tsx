// src/pages/Market.tsx
import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMarket, type Security } from '@/hooks/useMarket'
import { useUiStore } from '@/store/ui.store'
import { useIsMobile } from '@/hooks/useIsMobile'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SortDrawer } from '@/components/sort-drawer'
import type { SortColumn } from '@/store/ui.store'
import { usePortfolio } from '@/hooks/usePortfolio'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const TYPE_FILTERS = [
  { value: '', label: 'Все' },
  { value: 'share', label: 'Акции' },
  { value: 'bond', label: 'Облигации' },
  { value: 'etf', label: 'ETF' },
]

// ── HELPERS ───────────────────────────────────────────────────────────────────

const fmtPrice = (n: number | null | undefined) =>
  n == null || n === undefined ? '—' : n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtVolume = (n: number | null) => {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' М'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + ' К'
  return n.toString()
}

const fmtBadge = (value: number | null | undefined) => {
  if (value == null || value === undefined) return ""
  const positive = value >= 0
  if (positive) return `+${value.toFixed(2)}`
  return `${value.toFixed(2)}`
}

// ── CHANGE BADGE ──────────────────────────────────────────────────────────────

function ChangeBadge({ value }: { value: number | null | undefined }) {
  if (value == null || value === undefined) return <span className="text-muted-foreground">—</span>
  const positive = value >= 0
  return (
    <Badge variant={positive ? 'default' : 'destructive'}
      className={positive ? 'bg-green-500/15 text-green-600 hover:bg-green-500/15' : ''}>
      {positive ? '+' : ''}{value.toFixed(2)}%
    </Badge>
  )
}

// ── FILTERS ───────────────────────────────────────────────────────────────────

function Filters() {
  const { type, search } = useUiStore((s) => s.marketFilter)
  const setFilter = useUiStore((s) => s.setMarketFilter)

  return (
    <div className="space-y-3">
      <Input
        placeholder="Поиск по тикеру или названию..."
        value={search}
        onChange={(e) => setFilter({ search: e.target.value })}
        className="max-w-sm"
      />
      <div className="flex gap-2 flex-wrap">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter({ type: f.value })}
            className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${type === f.value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground'
              }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── SKELETON ROWS ─────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ── DESKTOP TABLE ─────────────────────────────────────────────────────────────

interface TableProps {
  items: Security[]
  sortCol: SortColumn | null
  sortDir: 'asc' | 'desc'
  onSort: (col: SortColumn) => void
  onRowClick: (ticker: string) => void
}

function SortIcon({ col, sortCol, sortDir }: {
  col: SortColumn
  sortCol: SortColumn | null
  sortDir: 'asc' | 'desc'
}) {
  if (sortCol !== col) return <span className="text-muted-foreground/40 ml-1">↕</span>
  return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

function DesktopTable({ items, sortCol, sortDir, onSort, onRowClick }: TableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead
            className="w-40 text-left cursor-pointer select-none hover:text-foreground"
            onClick={() => onSort('ticker')} >
            Тикер <SortIcon col="ticker" sortCol={sortCol} sortDir={sortDir} />
          </TableHead>
          <TableHead>Название</TableHead>
          <TableHead
            className="text-right cursor-pointer select-none hover:text-foreground"
            onClick={() => onSort('price')}
          >
            Цена <SortIcon col="price" sortCol={sortCol} sortDir={sortDir} />
          </TableHead>
          <TableHead
            className="text-right cursor-pointer select-none hover:text-foreground"
            onClick={() => onSort('change_pct')}
          >
            Изм. % <SortIcon col="change_pct" sortCol={sortCol} sortDir={sortDir} />
          </TableHead>
          <TableHead
            className="text-right cursor-pointer select-none hover:text-foreground"
            onClick={() => onSort('volume')}
          >
            Объём <SortIcon col="volume" sortCol={sortCol} sortDir={sortDir} />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((sec) => (
          <TableRow
            key={sec.ticker}
            className="cursor-pointer"
            onClick={() => onRowClick(sec.ticker)}
          >
            <TableCell className="font-mono font-semibold">{sec.ticker}</TableCell>
            <TableCell className="text-muted-foreground">{sec.short_name}</TableCell>
            <TableCell className="text-right font-mono">{fmtPrice(sec.price)}</TableCell>
            <TableCell className="text-right">
              <ChangeBadge value={sec.change_pct} />
            </TableCell>
            <TableCell className="text-right text-muted-foreground font-mono">
              {fmtVolume(sec.volume)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ── MOBILE CARDS ──────────────────────────────────────────────────────────────

function MobileCards({ items, onRowClick }: {
  items: Security[]
  onRowClick: (ticker: string) => void
}) {
  return (
    <div className="divide-y">
      {items.map((sec) => (
        <div
          key={sec.ticker}
          className="flex items-center justify-between px-4 py-3 cursor-pointer active:bg-accent/50"
          onClick={() => onRowClick(sec.ticker)}
        >
          <div className="min-w-0">
            <p className="font-mono font-semibold text-sm">{sec.ticker}</p>
            <p className="text-xs text-muted-foreground truncate">{sec.short_name}</p>
          </div>
          <div className="text-right shrink-0 ml-4 space-y-1">
            <p className="font-mono text-sm font-medium">{fmtPrice(sec.price)}</p>
            <ChangeBadge value={sec.change_pct} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── MARKET PAGE ───────────────────────────────────────────────────────────────

export function Market2() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const loaderRef = useRef<HTMLDivElement>(null)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    sortCol,
    sortDir,
    handleSort,
  } = useMarket()

  const { data: portfolioData } = usePortfolio()

  // flatten pages
  const sorted = data?.pages.flatMap((p) => p.items) ?? []

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

  const onRowClick = (ticker: string) => navigate(`/market/${ticker}`)

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* заголовок */}

      {isMobile && (
        <>
          <Card className="port-card">
            <CardHeader>
              <CardTitle className="port-label">
                Стоимость портфеля
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="port-total">₽ {fmtPrice(portfolioData?.total_value)}</div>
              <div className="port-pnl">

                <span className={cn(`pnl-badge`, portfolioData && portfolioData?.roi < 0 ? 'dn' : 'up')}>{fmtBadge(portfolioData?.roi)}%</span>
                <span className={cn(`pnl-badge`, portfolioData && portfolioData?.total_pnl < 0 ? 'dn' : 'up')}>{fmtBadge(portfolioData?.total_pnl)}</span>
              </div>
              <Separator className="my-4" />
              <div className="flex h-5 items-center justify-center gap-4 text-sm">            
                <div className="port-cash">Наличные: {fmtPrice(portfolioData?.portfolio.cash)}&nbsp;₽</div>
                <Separator orientation="vertical" />
                <div className="port-cash">Ценные бумаги: {fmtPrice(portfolioData?.pos_value)}</div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <div>
        <h1 className="text-xl font-bold">Рынок</h1>
        {data && (
          <p className="text-sm text-muted-foreground">
            {data.pages[0].total.toLocaleString('ru-RU')} инструментов
          </p>
        )}
      </div>

      {/* фильтры */}
      <Filters />

      {isMobile && (
        <SortDrawer />
      )}

      {/* контент */}
      {isLoading ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Тикер</TableHead>
              <TableHead>Название</TableHead>
              <TableHead className="text-right">Цена</TableHead>
              <TableHead className="text-right">Изм. %</TableHead>
              <TableHead className="text-right">Объём</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody><SkeletonRows /></TableBody>
        </Table>
      ) : sorted.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground text-sm">
          Ничего не найдено
        </div>
      ) : isMobile ? (
        <MobileCards items={sorted} onRowClick={onRowClick} />
      ) : (
        <DesktopTable
          items={sorted}
          sortCol={sortCol}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={onRowClick}
        />
      )}

      {/* триггер infinite scroll */}
      <div ref={loaderRef} className="h-8 flex items-center justify-center">
        {isFetchingNextPage && (
          <span className="text-xs text-muted-foreground">Загрузка...</span>
        )}
      </div>

    </div>
  )
}