// Маппинг ответов онбординга «Подбор» на фильтры каталога (GET /catalog).
// Слаги категорий — единая таксономия из seed API (docs/content/content-matrix.md);
// mock-данные используют её же.

import type { CatalogQuery, OnboardingAnswers } from '@refiesse-fit/shared'

/** Состояние (шаг 1) → категория каталога по смыслу. */
const goalToCategory: Record<string, string> = {
  'Шея и плечи зажаты': 'spina',
  'Поясница устала': 'lower-back',
  'Кор и живот': 'kor',
  'Расслабиться перед сном': 'relaxation',
}

/** Время (шаг 2) → максимальная длительность в минутах. */
const timeToMaxDuration: Record<string, number> = {
  '5–10 минут': 10,
  '15–20 минут': 20,
  '25–35 минут': 35,
}

/**
 * Собирает query для GET /catalog из ответов подбора.
 * Неизвестные значения просто не попадают в фильтр (мягкая деградация).
 */
export function onboardingToCatalogQuery(answers: OnboardingAnswers): CatalogQuery {
  const query: CatalogQuery = {}
  const category = goalToCategory[answers.goal]
  if (category) {
    query.category = category
  }
  const maxDuration = timeToMaxDuration[answers.time]
  if (maxDuration) {
    query.maxDuration = maxDuration
  }
  return query
}
