import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from '@app'
import './index.css'

const HOUR = 60 * 60 * 1000

// autoUpdate reloads the page once a new version activates. Installed iOS PWAs rarely
// re-check on their own, so also check when the app comes to the foreground and hourly.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => { if (navigator.onLine) void registration.update().catch(() => {}) }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    setInterval(check, HOUR)
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
