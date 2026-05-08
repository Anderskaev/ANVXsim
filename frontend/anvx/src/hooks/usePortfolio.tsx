
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/axios'
import type { Portfolio } from '@/store/auth.store'

export interface Position {
    avg_price: number
    current_price: number
    lot_size: number
    pnl: number
    pnl_pct: number
    quantity: number
    short_name: string
    ticker: string
    value: number
}

interface PortfolioPage {
    portfolio: Portfolio,
    "pos_value": number,
    "positions": Position[],
    "roi": number,
    "total_pnl": number,
    "total_value": number
}


export function usePortfolio() {
    const query = useQuery<PortfolioPage>({
        queryKey: ['portfolio'],
        queryFn: () => api.get('/portfolio').then((r) => r.data),
        refetchInterval: 60_000,
        staleTime: 55_000,
        // refetchIntervalInBackground: false (это значение по умолчанию)
    });
    return { ...query }
}