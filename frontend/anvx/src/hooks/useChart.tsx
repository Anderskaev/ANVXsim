import { useQuery } from '@tanstack/react-query'
import api from '@/lib/axios'

export interface Candle {
  date:   string | number
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
}

interface ChartResponse {
  ticker:  string
  tf:      string
  candles: Candle[]
}



export function useChart(ticker: string, tf: number/*, startDate?: string, endDate?: string*/) {
  return useQuery<ChartResponse>({
    queryKey: ['chart', ticker, tf],
    queryFn:  () => api.get(`/market/chart2/${ticker}`, {
      params: {
        tf,
        'reverse': 'true',

      },
    }).then((r) => r.data),
    enabled:   !!ticker,
    staleTime: 60_000,
  })
}