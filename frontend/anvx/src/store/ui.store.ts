import { create } from 'zustand'

interface UiState {
  // модал торговли
  tradeModal: {
    open:      boolean
    ticker:    string | null
    direction: 'buy' | 'sell'
  }
  openTradeModal:  (ticker: string, direction?: 'buy' | 'sell') => void
  closeTradeModal: () => void

  // фильтры рынка
  marketFilter: {
    type:   string
    search: string
  }
  setMarketFilter: (filter: Partial<UiState['marketFilter']>) => void
}

export const useUiStore = create<UiState>((set) => ({
  tradeModal: {
    open:      false,
    ticker:    null,
    direction: 'buy',
  },

  openTradeModal: (ticker, direction = 'buy') =>
    set({ tradeModal: { open: true, ticker, direction } }),

  closeTradeModal: () =>
    set({ tradeModal: { open: false, ticker: null, direction: 'buy' } }),

  marketFilter: {
    type:   '',
    search: '',
  },

  setMarketFilter: (filter) =>
    set((state) => ({
      marketFilter: { ...state.marketFilter, ...filter },
    })),
}))