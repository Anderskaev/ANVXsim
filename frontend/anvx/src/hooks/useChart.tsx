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

// сколько дней истории грузить для каждого таймфрейма
const TF_DAYS: Record<number, number> = {
  1:  1,    // 1м  → 1 день
  10: 3,    // 10м → 3 дня
  60: 7,    // 1ч  → 7 дней
  24: 365,  // 1д  → 1 год
  7:  730,  // 1н  → 2 года
  31: 1095, // 1мс → 3 года
  4:  3650//1095, // 3м  → 3 года
}

function getStartDate(tf: number): string {
  const days = TF_DAYS[tf] ?? 365
  const d    = new Date()
  d.setDate(d.getDate() - days)
  
  return d.toISOString().slice(0, 10)  // 'yyyy-mm-dd'
}

export function useChart(ticker: string, tf: number/*, startDate?: string, endDate?: string*/) {
  return useQuery<ChartResponse>({
    queryKey: ['chart', ticker, tf],
    queryFn:  () => api.get(`/market/chart2/${ticker}`, {
      params: {
        tf,
        'reverse': 'true',
        //start_date: startDate ?? getStartDate(tf),
        //end_date: endDate ? endDate : ''
      },
    }).then((r) => r.data),
    enabled:   !!ticker,
    staleTime: 60_000,
  })
}