// src/pages/Security.tsx

import { useCallback, useState, type Key } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRef, useEffect } from 'react'
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts'
import { useSecurity, type Amortization, type Coupon, type Dividend } from '@/hooks/useSecurity'
import { useChart, type Candle } from '@/hooks/useChart'
import { usePortfolio } from '@/hooks/usePortfolio'
import { TradeModal } from '@/components/trade-modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import api from '@/lib/axios'

// ── TIMEFRAMES ────────────────────────────────────────────────────────────────

const TIMEFRAMES = [
    { label: '1М', value: 1 },
    { label: '10М', value: 10 },
    { label: '1Ч', value: 60 },
    { label: '1Д', value: 24 },
    { label: '1Н', value: 7 },
    { label: '1МС', value: 31 },
    { label: '3М', value: 4 },
]

// ── HELPERS ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null, d = 2) =>
    n == null ? '—' : n.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d })

const fmtDate = (s: string) =>
    format(new Date(s), 'd MMM yyyy', { locale: ru })

// ── CANDLE CHART ──────────────────────────────────────────────────────────────

function CandleChart({
    candles,
    onLoadMore,
    isLoadingMore,
}: {
    candles: Candle[]
    onLoadMore: () => void
    isLoadingMore: boolean
}) {
    const chartRef = useRef<HTMLDivElement>(null)
    const seriesRef = useRef<any>(null)
    const loadingRef = useRef(false)  // защита от двойного вызова

    useEffect(() => {
        if (!chartRef.current || !candles.length) return

        const chart = createChart(chartRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#64748b',
            },
            grid: {
                vertLines: { color: 'hsl(var(--border))' },
                horzLines: { color: 'hsl(var(--border))' },
            },
            crosshair: { mode: 1 },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: 'hsl(var(--border))',
            },
            rightPriceScale: { borderColor: 'hsl(var(--border))' },
            width: chartRef.current.clientWidth,
            height: 340,
        })

        const series = chart.addSeries(CandlestickSeries, {
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderUpColor: '#22c55e',
            borderDownColor: '#ef4444',
            wickUpColor: '#22c55e',
            wickDownColor: '#ef4444',
        })
        seriesRef.current = series

        const seen = new Set<string | number>()
        const unique = candles.filter((c) => {
            if (seen.has(c.date)) return false
            seen.add(c.date)
            return true
        })

        series.setData(unique.map((c) => ({
            time: c.date as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
        })))

        chart.timeScale().scrollToRealTime()

        // ── подписка на прокрутку влево ───────────────────────
        chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
            if (!range) return
            if (range.from < 10 && !loadingRef.current) {
                loadingRef.current = true
                onLoadMore()
            }
        })

        const ro = new ResizeObserver(() => {
            chart.applyOptions({ width: chartRef.current?.clientWidth ?? 600 })
        })
        ro.observe(chartRef.current)

        return () => { chart.remove(); ro.disconnect() }
    }, [candles])  // пересоздаём при изменении candles

    // сбрасываем флаг когда загрузка завершилась
    useEffect(() => {
        if (!isLoadingMore) {
            loadingRef.current = false
        }
    }, [isLoadingMore])

    return (
        <div className="relative">
            <div ref={chartRef} className="w-full rounded-lg overflow-hidden" />
            {isLoadingMore && (
                <div className="absolute top-2 left-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                    Загрузка...
                </div>
            )}
        </div>
    )
}

// ── POSITION BLOCK ────────────────────────────────────────────────────────────

function PositionBlock({ ticker, price }: { ticker: string; price: number | null }) {
    const { data } = usePortfolio()
    const pos = data?.positions.find((p) => p.ticker === ticker)
    if (!pos) return null

    const pnl = price ? (price - pos.avg_price) * pos.quantity : pos.pnl
    const pnlPct = price ? (price / pos.avg_price - 1) * 100 : pos.pnl_pct
    const positive = pnl >= 0

    return (
        <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-semibold">Ваша позиция</p>
            <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                    <p className="text-muted-foreground text-xs">Количество</p>
                    <p className="font-medium">{pos.quantity} шт.</p>
                </div>
                <div>
                    <p className="text-muted-foreground text-xs">Ср. цена</p>
                    <p className="font-medium">{fmt(pos.avg_price)}</p>
                </div>
                <div>
                    <p className="text-muted-foreground text-xs">P&L</p>
                    <p className={`font-semibold ${positive ? 'text-green-500' : 'text-red-500'}`}>
                        {positive ? '+' : ''}{fmt(pnl, 0)} ₽
                    </p>
                    <p className={`text-xs ${positive ? 'text-green-500' : 'text-red-500'}`}>
                        {positive ? '+' : ''}{fmt(pnlPct)}%
                    </p>
                </div>
            </div>
        </div>
    )
}

// ── DIVIDENDS BLOCK ───────────────────────────────────────────────────────────

function DividendsBlock({ dividends }: { dividends: Dividend[] }) {
    if (!dividends?.length) return null
    return (
        <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-semibold">Дивиденды</p>
            <div className="space-y-2">
                {dividends.map((d, i) => (
                    <div key={i} className="flex justify-between text-sm">
                        <div>
                            <p className="text-muted-foreground text-xs">Отсечка</p>
                            <p>{fmtDate(d.registry_date)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-muted-foreground text-xs">Размер</p>
                            <p className="font-medium text-green-500">+{fmt(d.amount)} ₽</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── COUPONS BLOCK ─────────────────────────────────────────────────────────────

function CouponsBlock({ coupons, amortizations }: {
    coupons: Coupon[]
    amortizations: Amortization[]
}) {
    const hasCoupons = coupons?.length > 0
    const hasAmort = amortizations?.length > 0
    if (!hasCoupons && !hasAmort) return null

    return (
        <div className="rounded-lg border p-4 space-y-4">
            {hasCoupons && (
                <div className="space-y-2">
                    <p className="text-sm font-semibold">Купоны</p>
                    {coupons.map((c, i) => (
                        <div key={i} className="flex justify-between text-sm">
                            <p className="text-muted-foreground">{fmtDate(c.coupon_date)}</p>
                            <p className="font-medium text-green-500">+{fmt(c.amount)} ₽</p>
                        </div>
                    ))}
                </div>
            )}
            {hasAmort && (
                <div className="space-y-2">
                    <p className="text-sm font-semibold">Амортизация</p>
                    {amortizations.map((a: { amort_date: string; amount: number | null }, i: Key | null | undefined) => (
                        <div key={i} className="flex justify-between text-sm">
                            <p className="text-muted-foreground">{fmtDate(a.amort_date)}</p>
                            <p className="font-medium text-blue-500">+{fmt(a.amount)} ₽</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── SECURITY PAGE ─────────────────────────────────────────────────────────────

export default function Security() {
    const [allCandles, setAllCandles] = useState<Candle[]>([])
    const [oldestDate, setOldestDate] = useState<string | undefined>(undefined)
    const [isLoadingMore, setIsLoadingMore] = useState(false)

    const { ticker } = useParams<{ ticker: string }>()
    const navigate = useNavigate()
    const [tf, setTf] = useState(24)  // 1Д по умолчанию
    const [tradeOpen, setTradeOpen] = useState(false)
    const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy')

    const { data: sec, isLoading } = useSecurity(ticker ?? '')
    const { data: portfolio } = usePortfolio()
    const position = portfolio?.positions.find((p) => p.ticker === ticker)

    const { data: chartData, isLoading: chartLoading } = useChart(sec?.ticker ?? '', tf)

    // при смене таймфрейма или бумаги — сбрасываем
    useEffect(() => {
        setAllCandles([])
        setOldestDate(undefined)
    }, [tf, ticker])

    // когда пришли новые данные — сетаем
    useEffect(() => {
        if (!chartData?.candles.length) return
        setAllCandles(chartData.candles)
        // запоминаем самую раннюю дату
        const first = chartData.candles[0].date
        if (typeof first === 'number') {
            // Unix timestamp → 'yyyy-mm-dd'
            setOldestDate(new Date(first * 1000).toISOString().slice(0, 10))
        } else {
            setOldestDate(first)
        }
    }, [chartData])

    // догрузка при прокрутке влево
    const handleLoadMore = useCallback(async () => {
        if (!sec || !oldestDate || isLoadingMore) return
        setIsLoadingMore(true)

        try {
            // считаем период для догрузки
            const TF_DAYS: Record<number, number> = {
                1: 1, 10: 3, 60: 7, 24: 365, 7: 730, 31: 1095, 4: 1095,
            }

            const days = TF_DAYS[tf] ?? 365
            const endDate = oldestDate
            const start = new Date(oldestDate)
            start.setDate(start.getDate() - days)
            const startDate = start.toISOString().slice(0, 10)

            const res = await api.get(`/market/chart2/${sec.ticker}`, {
                params: { tf, start_date: startDate, end_date: endDate },
            })

            const older: Candle[] = res.data.candles
            if (!older.length || older.length < 5) {
                // данных больше нет — запрещаем дальнейшую догрузку
                setOldestDate(undefined)
                return
            }

            // prepend — старые свечи + существующие
            setAllCandles((prev) => {
                const existingDates = new Set(prev.map((c) => c.date))
                const newUnique = older.filter((c) => !existingDates.has(c.date))
                return [...newUnique, ...prev]
            })
            setOldestDate(typeof older[0].date === 'string' ? older[0].date : undefined)

        } catch (e) {
            console.error('Ошибка догрузки свечей', e)
        } finally {
            setIsLoadingMore(false)
        }
    }, [sec, tf, oldestDate, isLoadingMore])

    const up = (sec?.change_pct ?? 0) >= 0

    const openTrade = (side: 'buy' | 'sell') => {
        setTradeSide(side)
        setTradeOpen(true)
    }

    if (isLoading) return (
        <div className="p-4 md:p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-[340px] w-full" />
        </div>
    )

    if (!sec) return (
        <div className="p-4 md:p-6 text-center text-muted-foreground">
            Бумага не найдена
        </div>
    )

    return (
        <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">

            {/* back */}
            <button
                onClick={() => navigate(-1)}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
                ← Назад
            </button>

            {/* header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold font-mono">{sec.ticker}</h1>
                    <p className="text-muted-foreground text-sm">{sec.short_name}</p>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-bold">{fmt(sec.price)}</p>
                    <div className="flex gap-2 justify-end mt-1">
                        <Badge variant={up ? 'default' : 'destructive'}
                            className={up ? 'bg-green-500/15 text-green-600 hover:bg-green-500/15' : ''}
                        >
                            {up ? '+' : ''}{fmt(sec.change_pct)}%
                        </Badge>
                    </div>
                </div>
            </div>

            {/* open/high/low */}
            <div className="grid grid-cols-3 gap-2 text-sm">
                {[
                    ['Открытие', sec.open],
                    ['Макс.', sec.high],
                    ['Мин.', sec.low],
                ].map(([label, val]) => (
                    <div key={label as string} className="rounded-md border p-2 text-center">
                        <p className="text-muted-foreground text-xs">{label}</p>
                        <p className="font-medium">{fmt(val as number | null)}</p>
                    </div>
                ))}
            </div>

            {/* timeframes */}
            <div className="flex gap-1 flex-wrap">
                {TIMEFRAMES.map((t) => (
                    <button
                        key={t.value}
                        onClick={() => setTf(t.value)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${tf === t.value
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* chart */}
            {chartLoading ? (
                <Skeleton className="h-[340px] w-full rounded-lg" />
            ) : (
                <CandleChart
                    candles={allCandles}
                    onLoadMore={handleLoadMore}
                    isLoadingMore={isLoadingMore}
                />
            )}

            {/* position */}
            <PositionBlock ticker={sec.ticker} price={sec.price} />

            {/* buy / sell */}
            <div className="grid grid-cols-2 gap-3">
                <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => openTrade('buy')}
                >
                    ▲ Купить
                </Button>
                <Button
                    variant="destructive"
                    disabled={!position || position.quantity === 0}
                    onClick={() => openTrade('sell')}
                >
                    ▼ Продать
                </Button>
            </div>

            {/* dividends / coupons */}
            {sec.type === 'share' && (
                <DividendsBlock dividends={sec.dividends} />
            )}
            {sec.type === 'bond' && (
                <CouponsBlock coupons={sec.coupons} amortizations={sec.amortizations} />
            )}

            {/* trade modal */}
            {tradeOpen && (
                <TradeModal
                    open={tradeOpen}
                    onClose={() => setTradeOpen(false)}
                    security={sec}
                    position={position}
                    initialSide={tradeSide}
                />
            )}

        </div>
    )
}
