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

  test('Навигация вглубь/назад: каталог → тренировка → «Назад» возвращает в каталог', async ({
    page,
  }) => {
    await openApp(page)
    await navTo(page, NAV.catalog)

    // Каталог: >3 карточек. Уходим «вглубь» — открываем тренировку.
    await expect(page.locator('.workout-card').first()).toBeVisible()
    const freeCard = page.locator('.workout-card', { has: page.locator('.pill.free') }).first()
    await freeCard.click()
    // На экране тренировки: есть факты и кнопка «Я сделал(а)».
    await expect(page.locator('.facts')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Я сделал/ })).toBeVisible()

    // «Назад» по стеку навигации возвращает туда, откуда пришли — в каталог
    // (а не на жёстко зашитый экран). Каталог узнаём по числу карточек.
    await page.getByRole('button', { name: 'Назад' }).click()
    await expect(page.locator('.facts')).toHaveCount(0)
    expect(await page.locator('.workout-card').count()).toBeGreaterThan(3)
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

    // Экран тренировки: кнопка «Я сделал(а)» есть всегда (форма глагола зависит
    // от рода в подборе — матчим обе префиксом). Первичная CTA лейблом отличается
    // по типу видео (YouTube → «Начать тренировку», внешнее → «Смотреть видео»),
    // поэтому её не проверяем — важно, что экран тренировки открылся.
    const doneButton = page.getByRole('button', { name: /^Я сделал/ })
    await expect(doneButton).toBeVisible()
    await doneButton.click()

    // Мягкий toast-подтверждение.
    await expect(page.locator('.toast.show')).toContainText('Записано')

    // Автопереход на экран прогресса: тренировки ≥ 1, минуты > 0.
    await expect(page.getByRole('heading', { name: 'Даже 10 минут считаются' })).toBeVisible()

    // Порядок плиток фиксирован: тренировки, минуты, дни подряд, план.
    // Матчим по позиции, а не по форме слова (она плюрализуется: 1 минута /
    // 12 минут / 62 минуты), иначе локатор ломается на числах вроде 12.
    const workoutsStat = page.locator('.stats .stat').nth(0).locator('b')
    const minutesStat = page.locator('.stats .stat').nth(1).locator('b')
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

    // Оплата защищена: без email и согласия кнопка неактивна (чек ФФД / 152-ФЗ).
    const payButton = page.getByRole('button', { name: /Открыть за 500/ })
    await expect(payButton).toBeDisabled()
    await page.getByPlaceholder('you@example.com').fill('test@example.com')
    await page.getByRole('checkbox').check()
    await expect(payButton).toBeEnabled()

    await payButton.click()
    // Ключи ЮKassa не заданы → 503 → мягкая заглушка, остаёмся на paywall.
    await expect(page.locator('.toast.show')).toContainText('Оплата скоро подключится')
    await expect(
      page.getByRole('heading', { name: 'Идти по системе, а не искать посты' }),
    ).toBeVisible()
  })

  test('Онбординг (7 шагов, инвентарь мультивыбор) → персональная подборка', async ({ page }) => {
    await openApp(page)
    await navTo(page, NAV.onboarding)

    // Шаг 1/7: состояние → «Шея и плечи зажаты» (маппится на категорию spina).
    await expect(page.getByText('Шаг 1/7')).toBeVisible()
    await page.locator('.option', { hasText: 'Шея и плечи зажаты' }).click()
    await page.getByRole('button', { name: 'Дальше' }).click()

    // Шаг 2/7: уровень практики → «Новичок».
    await expect(page.getByText('Шаг 2/7')).toBeVisible()
    await page.locator('.option:has(strong:text-is("Новичок"))').click()
    await page.getByRole('button', { name: 'Дальше' }).click()

    // Шаг 3/7: инвентарь — мультивыбор (можно отметить несколько).
    // Матчим по заголовку опции (strong), а не по подстроке: описание
    // «Без инвентаря» содержит слово «коврика» и ловилось бы вторым элементом.
    await expect(page.getByText('Шаг 3/7')).toBeVisible()
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

    // Шаг 4/7: время → «15–20 минут».
    await expect(page.getByText('Шаг 4/7')).toBeVisible()
    await page.locator('.option', { hasText: '15–20 минут' }).click()
    await page.getByRole('button', { name: 'Дальше' }).click()

    // Шаг 5/7: ритм → «2–3 раза в неделю».
    await expect(page.getByText('Шаг 5/7')).toBeVisible()
    await page.locator('.option', { hasText: '2–3 раза в неделю' }).click()
    await page.getByRole('button', { name: 'Дальше' }).click()

    // Шаг 6/7: бережём зоны → «Поясница» (мультивыбор, необязательный).
    await expect(page.getByText('Шаг 6/7')).toBeVisible()
    await page.locator('.option:has(strong:text-is("Поясница"))').click()
    await page.getByRole('button', { name: 'Дальше' }).click()

    // Шаг 7/7: обращение (род) → финальная кнопка «Показать мою подборку».
    await expect(page.getByText('Шаг 7/7')).toBeVisible()
    await page.locator('.option:has(strong:text-is("Женский род"))').click()
    await page.getByRole('button', { name: 'Показать мою подборку' }).click()

    // После квиза — экран персональной подборки с ранжированными карточками.
    await expect(page.getByRole('heading', { name: 'Подобрано для тебя' })).toBeVisible()
    const cards = page.locator('.workout-card')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(0)
  })

  test('Бережём зоны: отметка зоны показывает мягкую заметку на тренировке', async ({ page }) => {
    await openApp(page)
    await navTo(page, NAV.onboarding)

    // Идём на дефолтах до шага «бережём зоны» (6/7).
    for (let i = 1; i <= 5; i += 1) {
      await expect(page.getByText('Шаг ' + i + '/7')).toBeVisible()
      await page.getByRole('button', { name: 'Дальше' }).click()
    }
    await expect(page.getByText('Шаг 6/7')).toBeVisible()
    // Онбординг персистится в dev-БД между прогонами: нормализуем состояние
    // через эксклюзивную «Нет, всё ок», затем выбираем зону (иначе повторный
    // клик по уже выбранной «Поясница» снял бы её).
    const careNone = page.locator('.option:has(strong:text-is("Нет, всё ок"))')
    const careBack = page.locator('.option:has(strong:text-is("Поясница"))')
    await careNone.click()
    await expect(careNone).toHaveClass(/active/)
    await careBack.click()
    await expect(careBack).toHaveClass(/active/)
    await expect(careNone).not.toHaveClass(/active/)
    await page.getByRole('button', { name: 'Дальше' }).click()

    // Шаг 7/7 — род, завершаем.
    await expect(page.getByText('Шаг 7/7')).toBeVisible()
    await page.getByRole('button', { name: 'Показать мою подборку' }).click()
    await expect(page.getByRole('heading', { name: 'Подобрано для тебя' })).toBeVisible()

    // Открываем free-тренировку — видна мягкая заметка «Бережём».
    await navTo(page, NAV.catalog)
    const freeCard = page.locator('.workout-card', { has: page.locator('.pill.free') }).first()
    await freeCard.click()
    await expect(page.locator('.note-care')).toContainText('Бережём')
    await expect(page.locator('.note-care')).toContainText('поясница')
  })

  test('Мужской род в онбординге → кнопка «Я сделал» (без «а»)', async ({ page }) => {
    await openApp(page)
    await navTo(page, NAV.onboarding)

    // Проходим первые 6 шагов на дефолтах (они предвыбраны), меняем только род.
    for (let i = 1; i <= 6; i += 1) {
      await expect(page.getByText('Шаг ' + i + '/7')).toBeVisible()
      await page.getByRole('button', { name: 'Дальше' }).click()
    }
    await expect(page.getByText('Шаг 7/7')).toBeVisible()
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

  test('Напоминания: включение показывает выбор времени', async ({ page }) => {
    await openApp(page)
    await navTo(page, NAV.profile)

    const card = page.locator('.reminders-card')
    await expect(card.getByRole('heading', { name: 'Напоминания' })).toBeVisible()

    // По умолчанию выключены — выбора времени нет.
    await expect(card.locator('.reminder-hours')).toHaveCount(0)

    // Включаем → появляется ряд времени; выбираем «Утро».
    await card.getByRole('button', { name: 'Включить напоминания' }).click()
    await expect(card.locator('.reminder-hours')).toBeVisible()
    await card.getByRole('button', { name: 'Утро' }).click()
    await expect(card.getByRole('button', { name: 'Утро' })).toHaveClass(/active/)

    // Выключение убирает выбор времени.
    await card.getByRole('button', { name: 'Выключить напоминания' }).click()
    await expect(card.locator('.reminder-hours')).toHaveCount(0)
  })
})
