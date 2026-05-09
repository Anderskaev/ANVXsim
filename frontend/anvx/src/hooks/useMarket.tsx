// src/hooks/useMarket.ts

import { useInfiniteQuery } from '@tanstack/react-query'
import api from '@/lib/axios'
import { useUiStore } from '@/store/ui.store'
import type { SortColumn } from '@/store/ui.store'

export interface Security {
  ticker:     string
  short_name: string
  full_name:  string | null
  type:       string
  lot_size:   number
  currency:   string
  price:      number | null
  change_pct: number | null
  volume:     number | null
  fetched_at: string | null
}

interface MarketPage {
  items:    Security[]
  page:     number
  pages:    number
  total:    number
  has_next: boolean
}

export function useMarket() {
  const { type, search } = useUiStore((s) => s.marketFilter)
  const { col: sortCol, dir: sortDir } = useUiStore((s) => s.marketSort)
  const { setMarketSort } = useUiStore()

  // const [sortCol, setSortCol] = useState<SortColumn | null>(null)
  // const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  console.log(type);
  const query = useInfiniteQuery<MarketPage>({
    queryKey:  ['market', type, search, sortCol, sortDir],  // ← сортировка в ключе
    queryFn:   ({ pageParam = 1 }) =>
      api.get('/market', {
        params: {
          page:   pageParam,
          type,
          search,
          limit:  50,
          sort:   sortCol  ?? 'ticker',
          order:  sortCol ? sortDir : 'asc',
        },
      }).then((r) => r.data),
    getNextPageParam: (last) => last.has_next ? last.page + 1 : undefined,
    initialPageParam: 1,
    refetchInterval:  60_000,
    refetchIntervalInBackground: false,
    staleTime: 55_000,
  })

  const handleSort = (col: SortColumn, dir: 'asc'|'desc'|null = null ) => {
    if(sortCol === col) {
      setMarketSort(col, sortDir === 'asc'?'desc':'asc')  
    } else if (!dir) {
      setMarketSort(col, 'asc')  
    } else setMarketSort(col, dir)  
 
  }

  return { ...query, sortCol, sortDir, handleSort }
}