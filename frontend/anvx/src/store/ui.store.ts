import { create } from 'zustand'

const SORT_COLUMNS = ['ticker', 'price', 'change_pct', 'volume'] as const
export type SortColumn = typeof SORT_COLUMNS[number]

interface UiState {

 // модал торговли
  tradeModal: {
    open: boolean
    ticker: string | null
    direction: 'buy' | 'sell'
  }
  openTradeModal: (ticker: string, direction?: 'buy' | 'sell') => void
  closeTradeModal: () => void

  marketSort: {
    col: SortColumn
    dir: 'asc' | 'desc'
  }
  setMarketSort: (col: SortColumn, dir: 'asc' | 'desc') => void
  resetMarketSort: () => void

  // фильтры рынка
  marketFilter: {
    type: string
    search: string
  }
  setMarketFilter: (filter: Partial<UiState['marketFilter']>) => void
}


export const useUiStore = create<UiState>((set) => ({

  marketSort: {
    col: 'ticker',
    dir: 'asc'
  },
  setMarketSort: (col, dir) =>
    set({ marketSort: { col, dir } }),
  resetMarketSort: () =>
    set({ marketSort: { col: 'ticker', dir: 'asc' } }),


  tradeModal: {
    open: false,
    ticker: null,
    direction: 'buy',
  },

  openTradeModal: (ticker, direction = 'buy') =>
    set({ tradeModal: { open: true, ticker, direction } }),

  closeTradeModal: () =>
    set({ tradeModal: { open: false, ticker: null, direction: 'buy' } }),

  marketFilter: {
    type: '',
    search: '',
  },

  setMarketFilter: (filter) =>
    set((state) => ({
      marketFilter: { ...state.marketFilter, ...filter },
    })),
}))