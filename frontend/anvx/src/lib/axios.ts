import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
})


// ── REQUEST interceptor — добавляем JWT ───────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── RESPONSE interceptor — refresh при 401 ────────────────
let isRefreshing = false
let queue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null = null) => {
  queue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token!)
  })
  queue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    // если 401 и это не повторный запрос и не запрос на refresh/login
    if (
      error.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      if (isRefreshing) {
        // ставим запрос в очередь пока идёт refresh
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject })
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }

      original._retry  = true
      isRefreshing     = true

      const refreshToken = localStorage.getItem('refresh_token')

      if (!refreshToken) {
        // нет refresh токена — разлогиниваем
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const { data } = await api.post('/auth/refresh', {
          refresh_token: refreshToken,
        })

        localStorage.setItem('access_token',  data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)

        api.defaults.headers.Authorization = `Bearer ${data.access_token}`
        processQueue(null, data.access_token)

        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)

      } catch (refreshError) {
        processQueue(refreshError, null)
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(refreshError)

      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export default api