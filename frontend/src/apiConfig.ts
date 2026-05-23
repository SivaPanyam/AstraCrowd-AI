/**
 * API / WebSocket base URLs.
 * Production Docker image uses same-origin (empty HTTP base, host-derived WS).
 * Local dev defaults to localhost:8000 unless VITE_* overrides are set.
 */
export function getApiBase(): string {
  const configured = import.meta.env.VITE_BACKEND_API_URL
  if (configured) return configured.replace(/\/$/, '')
  if (import.meta.env.PROD) return ''
  return 'http://localhost:8000'
}

export function getWsBase(): string {
  const configured = import.meta.env.VITE_BACKEND_WS_URL
  if (configured) return configured.replace(/\/$/, '')
  if (import.meta.env.PROD && typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}`
  }
  return 'ws://localhost:8000'
}
