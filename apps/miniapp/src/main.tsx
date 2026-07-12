import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import './index.css'
import App from './App.tsx'
import { initTelegram } from './telegram.ts'

// Внутри Telegram — инициализация SDK (expand, theme, viewport CSS-переменные).
// В обычном браузере — no-op, прототип продолжает работать как раньше.
initTelegram()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
