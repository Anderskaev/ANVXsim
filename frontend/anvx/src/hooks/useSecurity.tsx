import { useQuery } from '@tanstack/react-query'
import api from '@/lib/axios'

export interface Dividend {
    ticker: string
    registry_date: string
    payment_date: string | null
    amount: number
    currency: string
}

export interface Coupon {
    ticker: string
    coupon_date: string
    amount: number
}

export interface Amortization {
    ticker: string
    amort_date: string
    amount: number
    currency: string
}

export interface SecurityDetail {
    ticker: string
    short_name: string
    full_name: string | null
    type: 'share' | 'bond' | 'etf' | 'currency' | 'pif' | 'other'
    lot_size: number
    currency: string
    price: number | null
    open: number | null
    high: number | null
    low: number | null
    volume: number | null
    coupon: number | null
    change_pct: number | null
    fetched_at: string | null
    dividends: Dividend[]
    coupons: Coupon[]
    amortizations: Amortization[]
}

export function useSecurity(ticker: string) {
    return useQuery<SecurityDetail>({
        queryKey: ['security', ticker],
        queryFn: () => api.get(`/market/security/${ticker}`).then((r) => r.data),
        enabled: !!ticker,
        staleTime: 60_000,
        refetchInterval: 60_000,
    })
}