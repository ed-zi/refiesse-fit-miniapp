import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import './index.css'
import App from './App.tsx'
import { initTelegram } from './telegram.ts'
import { initSentry, Sentry } from './sentry.ts'

// Sentry (S4-2): включается только при заданном VITE_SENTRY_DSN, иначе no-op.
initSentry()

// Внутри Telegram — инициализация SDK (expand, theme, viewport CSS-переменные).
// В обычном браузере — no-op, прототип продолжает работать как раньше.
initTelegram()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div style={{ padding: 24, textAlign: 'center' }}>
          Что-то пошло не так. Попробуйте перезапустить приложение.
        </div>
      }
    >
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
