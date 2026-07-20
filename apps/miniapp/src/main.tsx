import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Основной шрифт Manrope — самохостится (bundled Vite), без Google Fonts CDN,
// чтобы шрифт грузился офлайн и надёжно в RU. Variable-файл включает кириллицу.
import '@fontsource-variable/manrope'
import './tokens.css'
import './index.css'
import App from './App.tsx'
import { initTelegram, isTelegramEnv } from './telegram.ts'
import { initSentry, Sentry } from './sentry.ts'

// Sentry (S4-2): включается только при заданном VITE_SENTRY_DSN, иначе no-op.
initSentry()

// Внутри Telegram — инициализация SDK (expand, theme, viewport CSS-переменные).
// В обычном браузере — no-op, прототип продолжает работать как раньше.
initTelegram()

// В Telegram убираем «рамку устройства»: Mini App должен занимать весь экран.
// Класс включает full-bleed стили (App.css). В браузере рамка остаётся как
// превью-макет (на узких экранах она тоже убирается через media-query).
if (isTelegramEnv()) {
  document.documentElement.classList.add('in-telegram')
}

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
