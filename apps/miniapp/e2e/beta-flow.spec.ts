import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

// E2E бета-флоу Refiesse Fit: реальный фронт (vite) против реального API + БД.
// Навигация по левой панели прототипа (aside.brief — role-кнопки со шагами)
// и по нижней навигации. Оплата/вебхуки Tribute здесь НЕ гоняются — это
// интеграционные тесты API (apps/api). Здесь — пользовательский путь во фронте.

/** Подписи кнопок левой навигации (steps в App.tsx). */
const NAV = {
  home: 'Home: быстрое действие на сегодня',
  onboarding: 'Подбор: понять состояние',
  catalog: 'Каталог: выбрать тренировку',
  plans: 'Планы: система на 5–7 дней',
  progress: 'Прогресс: удержание без давления',
  profile: 'Профиль: подписка и настройки',
} as const

/** Сетевые 404 логируются Chromium как console error — это не баг приложения. */
function isBenignConsoleError(message: ConsoleMessage): boolean {
  const text = message.text()
  return text.includes('Failed to load resource') || text.includes('favicon')
}

/** Открыть приложение и дождаться готовности (Home загрузился из API). */
async function openApp(page: Page): Promise<void> {
  await page.goto('/')
  // Данные пришли из API → исчез скелетон, виден заголовок Home.
  await expect(page.getByRole('heading', { name: 'Что нужно телу сегодня?' })).toBeVisible()
}

async function navTo(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label }).click()
}

test.describe('Refiesse Fit — бета-флоу', () => {
  test('Home загружается из API без ошибок консоли', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isBenignConsoleError(msg)) {
        errors.push(msg.text())
      }
    })
    page.on('pageerror', (err) => errors.push(err.message))

    await openApp(page)

    // Контент реальный, не заглушка: категории и «Тренировка дня» из БД.
    await expect(page.getByRole('heading', { name: 'Тренировка дня' })).toBeVisible()
    // Экран загрузки ушёл (нет aria-busy скелетона).
    await expect(page.locator('section[aria-busy="true"]')).toHaveCount(0)

    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([])
  })

  test('Каталог показывает тренировки из БД (>3, есть free и premium)', async ({ page }) => {
    await openApp(page)
    await navTo(page, NAV.catalog)

    const cards = page.locator('.workout-card')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(3)

    // В каталоге присутствуют и бесплатные, и premium карточки.
    await expect(page.locator('.workout-card .pill.free').first()).toBeVisible()
    await expect(page.locator('.workout-card .pill.premium').first()).toBeVisible()
  })

  test('Free-тренировка → «Я сделала» → toast и прогресс ≥1 тренировка и минуты', async ({
    page,
  }) => {
    await openApp(page)
    await navTo(page, NAV.catalog)

    // Первая карточка с бейджем free ведёт на экран тренировки (не locked).
    const freeCard = page.locator('.workout-card', { has: page.locator('.pill.free') }).first()
    await expect(freeCard).toBeVisible()
    await freeCard.click()

    // Экран тренировки: есть кнопки «Начать тренировку» и «Я сделала».
    await expect(page.getByRole('button', { name: 'Начать тренировку' })).toBeVisible()
    await page.getByRole('button', { name: 'Я сделала' }).click()

    // Мягкий toast-подтверждение.
    await expect(page.locator('.toast.show')).toContainText('Записано')

    // Автопереход на экран прогресса: тренировки ≥ 1, минуты > 0.
    await expect(page.getByRole('heading', { name: 'Даже 10 минут считаются' })).toBeVisible()

    const workoutsStat = page.locator('.stat', { hasText: 'тренировки' }).locator('b')
    const minutesStat = page.locator('.stat', { hasText: 'минуты' }).locator('b')
    await expect(workoutsStat).toBeVisible()
    expect(Number(await workoutsStat.innerText())).toBeGreaterThanOrEqual(1)
    expect(Number(await minutesStat.innerText())).toBeGreaterThan(0)

    // История практик содержит только что отмеченную тренировку.
    await expect(page.getByRole('heading', { name: 'Недавние практики' })).toBeVisible()
    await expect(page.locator('.history-item').first()).toBeVisible()

    // Живой профиль (LP-1): пост-тренировочный микро-вопрос «Как ощущалось?».
    const sheet = page.locator('.feedback-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Как ощущалось?')
    await page.getByRole('button', { name: 'В самый раз' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(page.locator('.toast.show')).toContainText('Спасибо')
  })

  test('Premium-карточка ведёт в locked, затем в paywall', async ({ page }) => {
    await openApp(page)
    await navTo(page, NAV.catalog)

    const premiumCard = page
      .locator('.workout-card', { has: page.locator('.pill.premium') })
      .first()
    await expect(premiumCard).toBeVisible()
    await premiumCard.click()

    // Locked-экран: premium-контент закрыт, есть CTA в paywall.
    await expect(page.getByRole('heading', { name: 'Откройте доступ, чтобы продолжить' })).toBeVisible()
    const toPaywall = page.getByRole('button', { name: 'Открыть Premium' })
    await expect(toPaywall).toBeVisible()
    await toPaywall.click()

    // Paywall: ценностное предложение Premium.
    await expect(
      page.getByRole('heading', { name: 'Идти по системе, а не искать посты' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /Открыть за 500/ })).toBeVisible()
  })

  test('Paywall без настроенной оплаты: мягкий toast, без внешнего перехода', async ({ page }) => {
    await openApp(page)
    // Прямой заход на paywall через левую навигацию.
    await navTo(page, 'Paywall: ценность + оплата')
    await expect(
      page.getByRole('heading', { name: 'Идти по системе, а не искать посты' }),
    ).toBeVisible()

    await page.getByRole('button', { name: /Открыть за 500/ }).click()
    // Ссылка Tribute не задана → мягкая заглушка, остаёмся на paywall.
    await expect(page.locator('.toast.show')).toContainText('Оплата скоро подключится')
    await expect(
      page.getByRole('heading', { name: 'Идти по системе, а не искать посты' }),
    ).toBeVisible()
  })

  test('Онбординг (6 шагов, инвентарь мультивыбор) → персональная подборка', async ({ page }) => {
    await openApp(page)
    await navTo(page, NAV.onboarding)

    // Шаг 1/6: состояние → «Шея и плечи зажаты» (маппится на категорию spina).
    await expect(page.getByText('Шаг 1/6')).toBeVisible()
    await page.locator('.option', { hasText: 'Шея и плечи зажаты' }).click()
    await page.getByRole('button', { name: 'Дальше' }).click()

    // Шаг 2/6: уровень практики → «Новичок».
    await expect(page.getByText('Шаг 2/6')).toBeVisible()
    await page.locator('.option:has(strong:text-is("Новичок"))').click()
    await page.getByRole('button', { name: 'Дальше' }).click()

    // Шаг 3/6: инвентарь — мультивыбор (можно отметить несколько).
    // Матчим по заголовку опции (strong), а не по подстроке: описание
    // «Без инвентаря» содержит слово «коврика» и ловилось бы вторым элементом.
    await expect(page.getByText('Шаг 3/6')).toBeVisible()
    const noEquip = page.locator('.option:has(strong:text-is("Без инвентаря"))')
    const mat = page.locator('.option:has(strong:text-is("Коврик"))')
    const band = page.locator('.option:has(strong:text-is("Резинка"))')
    // Нормализуем стартовое состояние: онбординг мог сохраниться из прошлой
    // сессии (подбор персистится в БД), тогда клик по уже выбранной опции
    // снял бы её. Эксклюзивная «Без инвентаря» сбрасывает выбор в известное.
    await noEquip.click()
    await expect(noEquip).toHaveClass(/active/)
    // Теперь Коврик и Резинка гарантированно неактивны → клик их включает.
    await mat.click()
    await band.click()
    await expect(mat).toHaveClass(/active/)
    await expect(band).toHaveClass(/active/)
    // «Без инвентаря» эксклюзивна — после выбора инвентаря она снялась.
    await expect(noEquip).not.toHaveClass(/active/)
    await page.getByRole('button', { name: 'Дальше' }).click()

    // Шаг 4/6: время → «15–20 минут».
    await expect(page.getByText('Шаг 4/6')).toBeVisible()
    await page.locator('.option', { hasText: '15–20 минут' }).click()
    await page.getByRole('button', { name: 'Дальше' }).click()

    // Шаг 5/6: ритм → «2–3 раза в неделю».
    await expect(page.getByText('Шаг 5/6')).toBeVisible()
    await page.locator('.option', { hasText: '2–3 раза в неделю' }).click()
    await page.getByRole('button', { name: 'Дальше' }).click()

    // Шаг 6/6: обращение (род) → финальная кнопка «Показать мою подборку».
    await expect(page.getByText('Шаг 6/6')).toBeVisible()
    await page.locator('.option:has(strong:text-is("Женский род"))').click()
    await page.getByRole('button', { name: 'Показать мою подборку' }).click()

    // После квиза — экран персональной подборки с ранжированными карточками.
    await expect(page.getByRole('heading', { name: 'Подобрано для тебя' })).toBeVisible()
    const cards = page.locator('.workout-card')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(0)
  })

  test('Мужской род в онбординге → кнопка «Я сделал» (без «а»)', async ({ page }) => {
    await openApp(page)
    await navTo(page, NAV.onboarding)

    // Проходим первые 5 шагов на дефолтах (они предвыбраны), меняем только род.
    for (let i = 1; i <= 5; i += 1) {
      await expect(page.getByText('Шаг ' + i + '/6')).toBeVisible()
      await page.getByRole('button', { name: 'Дальше' }).click()
    }
    await expect(page.getByText('Шаг 6/6')).toBeVisible()
    await page.locator('.option:has(strong:text-is("Мужской род"))').click()
    await page.getByRole('button', { name: 'Показать мою подборку' }).click()
    await expect(page.getByRole('heading', { name: 'Подобрано для тебя' })).toBeVisible()

    // Открываем free-тренировку и проверяем мужскую форму кнопки.
    await navTo(page, NAV.catalog)
    const freeCard = page.locator('.workout-card', { has: page.locator('.pill.free') }).first()
    await freeCard.click()
    await expect(page.getByRole('button', { name: 'Я сделал', exact: true })).toBeVisible()
  })

  test('Профиль без premium: «Подписка не активна»', async ({ page }) => {
    await openApp(page)
    await navTo(page, NAV.profile)

    await expect(page.getByRole('heading', { name: 'Управление подпиской' })).toBeVisible()
    // Бейдж статуса и поясняющий текст — доступ не оплачен.
    await expect(page.locator('.program .badge', { hasText: 'Подписка не активна' })).toBeVisible()
    await expect(page.getByText('Подписка не активна. Premium откроет')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Открыть Premium' })).toBeVisible()
  })
})
