// src/pages/Security.tsx
import { useCallback, useEffect, useRef, useState, type Key } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSecurity, type Amortization, type Coupon, type Dividend } from '@/hooks/useSecurity'
import { usePortfolio } from '@/hooks/usePortfolio'
import { TradeModal } from '@/components/trade-modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useChart, type Candle } from '@/hooks/useChart'
import { createChart, ColorType, CandlestickSeries, TickMarkType, type Time } from 'lightweight-charts'
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

    console.log(hasCoupons)

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
                    <p className="text-sm font-semibold">Амортизация/погашение</p>
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

const toDate = (time: Time): Date => {
    // Строка вида "2026-05-14 19:20:00" или "2026-05-14"
    if (typeof time === 'string') {
        // Заменяем пробел на T чтобы парсилось корректно, добавляем Z если нет таймзоны
        return new Date(time.replace(' ', 'T') + (time.includes('+') ? '' : 'Z'));
    }
    
    // BusinessDay { year, month, day }
    if (typeof time === 'object') {
        return new Date(Date.UTC(time.year, time.month - 1, time.day));
    }
    
    // Unix timestamp (number)
    return new Date(time * 1000);
};

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
    const isFetchingRef = useRef(false)
    const onLoadMoreRef = useRef(onLoadMore)
    const isLoadingMoreRef = useRef(isLoadingMore)

    useEffect(() => {
        onLoadMoreRef.current = onLoadMore
    }, [onLoadMore])

    useEffect(() => {
        isLoadingMoreRef.current = isLoadingMore
        if (!isLoadingMore) {
            isFetchingRef.current = false // Разблокируем для следующего скролла
        }
    }, [isLoadingMore])

    useEffect(() => {
        if (!chartRef.current) return

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
                tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) => {
                    const date = toDate(time);
                    const options: Intl.DateTimeFormatOptions = {
                        timeZone: 'Europe/Moscow',
                    };

                    switch (tickMarkType) {
                        case TickMarkType.Year:
                            options.year = 'numeric';
                            break;
                        case TickMarkType.Month:
                            options.month = 'short';
                            options.year = 'numeric';
                            break;
                        case TickMarkType.DayOfMonth:
                            options.day = '2-digit';
                            options.month = '2-digit';
                            break;
                        case TickMarkType.Time:
                            options.hour = '2-digit';
                            options.minute = '2-digit';
                            break;
                        case TickMarkType.TimeWithSeconds:
                            options.hour = '2-digit';
                            options.minute = '2-digit';
                            options.second = '2-digit';
                            break;
                    }

                    return new Intl.DateTimeFormat('ru-RU', options).format(date);
                },
            },
            localization: {
                locale: 'ru-RU', // Формат вывода дат

                // Функция форматирования времени для всплывающей подсказки и оси
                timeFormatter: (time: Time) => {
                    // Переводим секунды Unix в миллисекунды JS
                    const date = toDate(time);
                    return new Intl.DateTimeFormat('ru-RU', {
                        timeZone: 'Europe/Moscow', // Укажите нужный часовой пояс (например, 'GMT', 'Europe/Moscow')
                        hour: '2-digit',
                        minute: '2-digit',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                    }).format(date);
                },
            },
            rightPriceScale: { borderColor: 'hsl(var(--border))' },
            width: chartRef.current.clientWidth,
            height: 300,
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

        chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
            if (!range) return
            if (range.from < 10 && !isLoadingMoreRef.current && !isFetchingRef.current) {
                isFetchingRef.current = true
                onLoadMoreRef.current()
            }
        })

        const ro = new ResizeObserver(() => {
            chart.applyOptions({ width: chartRef.current?.clientWidth ?? 600 })
        })
        ro.observe(chartRef.current)

        return () => {
            chart.remove()
            ro.disconnect()
        }
    }, [])

    useEffect(() => {
        if (!chartRef.current) return
        if (!seriesRef.current || candles.length === 0) return

        seriesRef.current.setData(candles.map((c) => ({
            time: c.date as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
        })))

    }, [candles])

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

// ── SECURITY PAGE ─────────────────────────────────────────────────────────────


export default function Security() {

    const { ticker } = useParams<{ ticker: string }>()
    const navigate = useNavigate()
    const [tf, setTf] = useState(24)  // 1Д по умолчанию
    const [tradeOpen, setTradeOpen] = useState(false)
    const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy')
    const [isLoadingMore, setIsLoadingMore] = useState(false)

    const { data: sec, isLoading } = useSecurity(ticker ?? '')
    const { data: portfolio } = usePortfolio()
    const position = portfolio?.positions.find((p) => p.ticker === ticker)

    const [candles, setCandles] = useState<Candle[]>([])
    const [start_index, setStartIndex] = useState(501)
    const [prev_start_index, setPrevStartIndex] = useState(0)

    const { data: ChartData, isLoading: chartLoading } = useChart(sec?.ticker ?? '', tf)
    const isLoadingMoreRef = useRef(isLoadingMore)
    useEffect(() => { isLoadingMoreRef.current = isLoadingMore }, [isLoadingMore])

    // Один эффект для обработки смены TF, тикера и прихода данных
    useEffect(() => {

        setStartIndex(501)
        setPrevStartIndex(0)
        setIsLoadingMore(false)

        // Если данные в кэше или только пришли — записываем их
        if (ChartData?.candles) {
            setCandles(ChartData.candles)
        } else {
            // Если данных еще нет (идет загрузка) — очищаем график
            setCandles([])
        }


    }, [tf, ticker, ChartData]) // Добавили tf и ticker в зависимости

    const handleLoadMore = useCallback(async () => {
        setIsLoadingMore(true)
        if (!sec || isLoadingMoreRef.current || start_index == prev_start_index) {
            setTimeout(() => {
                setIsLoadingMore(false);
            }, 150);
            return
        }

        try {
            const res = await api.get(`/market/chart2/${sec.ticker}`, {
                params: {
                    tf,
                    'reverse': 'true',
                    start_index,
                },
            })
            const newCandles = (await res).data.candles as Candle[]

            const seen = new Set<string | number>()
            const unique = newCandles.filter((c) => {
                if (seen.has(c.date)) return false
                seen.add(c.date)
                return true
            })

            if (!unique || unique.length === 0) {
                setPrevStartIndex(start_index) // Приравняет их, чтобы заблокировать дальнейшие запросы
                return
            }

            setPrevStartIndex(start_index)
            setStartIndex((prev) => {
                const nextIndex = prev + unique.length
                return nextIndex
            })

            setCandles((prev) => {
                const loaded = unique.filter((c) => !prev.some((p) => p.date === c.date))
                return [...loaded, ...prev]
            })

        } catch (e) {
            console.error('Ошибка догрузки свечей', e)
        } finally {
            setIsLoadingMore(false)
        }

    }, [sec, tf, start_index, prev_start_index])

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

            {chartLoading ? (
                <Skeleton className="h-[340px] w-full rounded-lg" />
            ) : (
                <CandleChart
                    candles={candles}
                    onLoadMore={handleLoadMore}
                    isLoadingMore={isLoadingMore}
                />
            )}

            {/* chart */}
            {/* {chartLoading ? (
                <Skeleton className="h-[340px] w-full rounded-lg" />
            ) : (
                <></>
                 <CandleChart />
            )} */}

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
