/**
 * Рекомендательный скоринг (RP-1). Чистые функции — тестируются без HTTP.
 *
 * Профиль берётся из сохранённого onboarding пользователя (JSON). Значения
 * лейблов — как в квизе фронта (apps/miniapp onboardingSteps): goal/time/
 * equipment/level. Инвентарь в квизе капитализирован («Коврик»), а в БД —
 * строчными («коврик»), поэтому сравнение регистронезависимое.
 */

/**
 * Цель квиза → slug категории (content-matrix §2). Единый источник для
 * catalog.ts (тренировка дня) и рекомендаций.
 */
export const GOAL_TO_CATEGORY_SLUG: Record<string, string> = {
  'Шея и плечи зажаты': 'spina',
  'Поясница устала': 'lower-back',
  'Кор и живот': 'kor',
  'Расслабиться перед сном': 'relaxation',
};

/** Лейбл уровня из квиза → ранг сложности (0..2). */
const LEVEL_LABEL_TO_RANK: Record<string, number> = {
  Новичок: 0,
  Уверенный: 1,
  Продвинутый: 2,
};

/** Уровень тренировки → ранг сложности (0..2). */
const WORKOUT_LEVEL_RANK: Record<'beginner' | 'medium' | 'advanced', number> = {
  beginner: 0,
  medium: 1,
  advanced: 2,
};

/** Лейбл времени из квиза → верхняя граница длительности (мин). */
const TIME_TO_MAX_MIN: Record<string, number> = {
  '5–10 минут': 10,
  '15–20 минут': 20,
  '25–35 минут': 35,
};

/** Лейбл «инвентарь не нужен» — снимает остальные и означает пустое множество. */
export const NO_EQUIPMENT_LABEL = 'Без инвентаря';

/** Нормализованный профиль подбора (лейблы квиза). */
export interface RecommendProfile {
  goal?: string;
  time?: string;
  equipment: string[];
  level?: string;
  frequency?: string;
}

/** Минимум, нужный для скоринга тренировки. */
export interface ScorableWorkout {
  categorySlug: string;
  level: 'beginner' | 'medium' | 'advanced';
  equipment: string[];
  durationMin: number;
  access: 'free' | 'premium';
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

/** Инвентарь пользователя как множество (регистр не важен); «Без инвентаря»/пусто → ∅. */
function effectiveEquipment(equipment: string[]): Set<string> {
  const set = new Set<string>();
  for (const item of equipment) {
    const n = norm(item);
    if (n === '' || n === norm(NO_EQUIPMENT_LABEL)) {
      continue;
    }
    set.add(n);
  }
  return set;
}

/**
 * Балл тренировки под профиль (RP-1):
 *   цель→категория совпала             → +50
 *   сложность: > уровня −30, == +20, < +10 (нет уровня → 0)
 *   инвентарь: тренировке хватает того, что есть (или не нужен) → +15, иначе −40
 *   длительность: ≤ max +10, ≤ max+5 0, иначе −10 (нет времени → 0)
 *   free-бонус (ценность до paywall) → +5
 */
export function scoreWorkout(workout: ScorableWorkout, profile: RecommendProfile): number {
  let score = 0;

  // Цель → категория.
  if (profile.goal !== undefined) {
    const targetCategory = GOAL_TO_CATEGORY_SLUG[profile.goal];
    if (targetCategory !== undefined && targetCategory === workout.categorySlug) {
      score += 50;
    }
  }

  // Уровень.
  const userRank = profile.level !== undefined ? LEVEL_LABEL_TO_RANK[profile.level] : undefined;
  if (userRank !== undefined) {
    const workoutRank = WORKOUT_LEVEL_RANK[workout.level];
    if (workoutRank > userRank) {
      score -= 30;
    } else if (workoutRank === userRank) {
      score += 20;
    } else {
      score += 10;
    }
  }

  // Инвентарь.
  const userEquipment = effectiveEquipment(profile.equipment);
  const workoutNeeds = workout.equipment.map(norm).filter((e) => e !== '');
  const hasAllNeeded = workoutNeeds.every((e) => userEquipment.has(e));
  score += workoutNeeds.length === 0 || hasAllNeeded ? 15 : -40;

  // Длительность.
  const maxMin = profile.time !== undefined ? TIME_TO_MAX_MIN[profile.time] : undefined;
  if (maxMin !== undefined) {
    if (workout.durationMin <= maxMin) {
      score += 10;
    } else if (workout.durationMin <= maxMin + 5) {
      score += 0;
    } else {
      score -= 10;
    }
  }

  // Free-бонус.
  if (workout.access === 'free') {
    score += 5;
  }

  return score;
}

/**
 * Ранжирует тренировки по убыванию балла (тай-брейк — короче сверху).
 * profile === null (нет onboarding): дефолт — free сверху, затем по длительности.
 */
export function rankWorkouts<T extends ScorableWorkout>(
  workouts: readonly T[],
  profile: RecommendProfile | null,
): T[] {
  if (profile === null) {
    return [...workouts].sort((a, b) => {
      const aFree = a.access === 'free' ? 0 : 1;
      const bFree = b.access === 'free' ? 0 : 1;
      if (aFree !== bFree) {
        return aFree - bFree;
      }
      return a.durationMin - b.durationMin;
    });
  }

  return [...workouts]
    .map((workout) => ({ workout, score: scoreWorkout(workout, profile) }))
    .sort((a, b) => b.score - a.score || a.workout.durationMin - b.workout.durationMin)
    .map((entry) => entry.workout);
}

/** План для выбора: slug + категории его дней (null — день без тренировки). */
export interface RankablePlan {
  slug: string;
  days: Array<{ categorySlug: string | null }>;
}

/** slug дефолтного плана, если ничего лучше не нашлось. */
export const DEFAULT_PLAN_SLUG = 'plan-back-posture-7';

/**
 * Выбирает план под цель: тот, чьи дни максимально из категории цели.
 * Если совпадений нет / цели нет — дефолтный план (или первый). Планов нет → null.
 */
export function pickRecommendedPlan<T extends RankablePlan>(
  programs: readonly T[],
  profile: RecommendProfile | null,
): T | null {
  if (programs.length === 0) {
    return null;
  }

  const target = profile?.goal !== undefined ? GOAL_TO_CATEGORY_SLUG[profile.goal] : undefined;
  if (target !== undefined) {
    let best: T | null = null;
    let bestRatio = 0;
    for (const program of programs) {
      const dayCategories = program.days
        .map((day) => day.categorySlug)
        .filter((slug): slug is string => slug !== null);
      if (dayCategories.length === 0) {
        continue;
      }
      const matches = dayCategories.filter((slug) => slug === target).length;
      const ratio = matches / dayCategories.length;
      if (matches > 0 && ratio > bestRatio) {
        bestRatio = ratio;
        best = program;
      }
    }
    if (best !== null) {
      return best;
    }
  }

  return programs.find((program) => program.slug === DEFAULT_PLAN_SLUG) ?? programs[0] ?? null;
}

/** Безопасно строит профиль из сохранённого onboarding (JSON). Нет данных → null. */
export function buildProfileFromOnboarding(onboarding: unknown): RecommendProfile | null {
  if (typeof onboarding !== 'object' || onboarding === null) {
    return null;
  }
  const raw = onboarding as Record<string, unknown>;
  const goal = typeof raw['goal'] === 'string' ? raw['goal'] : undefined;
  const time = typeof raw['time'] === 'string' ? raw['time'] : undefined;
  const level = typeof raw['level'] === 'string' ? raw['level'] : undefined;
  const frequency = typeof raw['frequency'] === 'string' ? raw['frequency'] : undefined;
  const equipment = Array.isArray(raw['equipment'])
    ? raw['equipment'].filter((e): e is string => typeof e === 'string')
    : [];

  // Пустой профиль (ни одного значимого поля) → считаем «нет onboarding».
  if (goal === undefined && time === undefined && level === undefined && equipment.length === 0) {
    return null;
  }
  return { goal, time, equipment, level, frequency };
}
