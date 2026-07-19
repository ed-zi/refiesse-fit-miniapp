/**
 * Живой профиль (LP-1). Чистые функции — тестируются без HTTP и без БД.
 *
 * После каждой отметки «Я сделала» пользователю показывается мягкий
 * микро-вопрос «Как ощущалось?» с одним касанием: мягко / в самый раз /
 * тяжело. Ответы копятся в User.profileSignals (JSON) и со временем сдвигают
 * сложность в рекомендациях — без анкет, веса и медицинских вопросов.
 */

/** Ответ на пост-тренировочный микро-вопрос. */
export type FeedbackRating = 'soft' | 'right' | 'hard';

export const FEEDBACK_RATINGS: readonly FeedbackRating[] = ['soft', 'right', 'hard'];

/** Одна запись обратной связи. */
export interface FeedbackSignal {
  workoutSlug: string;
  rating: FeedbackRating;
  /** ISO-строка момента ответа (UTC). */
  at: string;
}

/** Накопленные сигналы живого профиля (то, что лежит в User.profileSignals). */
export interface ProfileSignals {
  feedback: FeedbackSignal[];
}

/** Сколько последних ответов храним (хвост обрезаем). */
export const FEEDBACK_CAP = 30;

/** Окно «недавних» ответов, по которым считаем сдвиг сложности. */
export const RECENT_WINDOW = 5;

/** Пустой профиль. */
export function emptyProfileSignals(): ProfileSignals {
  return { feedback: [] };
}

function isFeedbackRating(value: unknown): value is FeedbackRating {
  return value === 'soft' || value === 'right' || value === 'hard';
}

/** Безопасно читает profileSignals-JSON из БД; повреждённое/пустое → пустой профиль. */
export function parseProfileSignals(value: unknown): ProfileSignals {
  if (typeof value !== 'object' || value === null) {
    return emptyProfileSignals();
  }
  const raw = (value as Record<string, unknown>)['feedback'];
  if (!Array.isArray(raw)) {
    return emptyProfileSignals();
  }
  const feedback: FeedbackSignal[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const entry = item as Record<string, unknown>;
    const workoutSlug = entry['workoutSlug'];
    const rating = entry['rating'];
    const at = entry['at'];
    if (typeof workoutSlug === 'string' && isFeedbackRating(rating) && typeof at === 'string') {
      feedback.push({ workoutSlug, rating, at });
    }
  }
  return { feedback };
}

/** YYYY-MM-DD (UTC) из ISO-строки — для мягкой дедупликации по дню. */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Добавляет ответ в живой профиль. Мягкая идемпотентность: если последний
 * ответ — по той же тренировке в тот же UTC-день, он заменяется (пользователь
 * передумал), а не задваивается. Хвост обрезается до FEEDBACK_CAP.
 */
export function appendFeedback(
  existing: ProfileSignals,
  signal: FeedbackSignal,
): ProfileSignals {
  const feedback = [...existing.feedback];
  const last = feedback[feedback.length - 1];
  if (
    last !== undefined &&
    last.workoutSlug === signal.workoutSlug &&
    dayKey(last.at) === dayKey(signal.at)
  ) {
    feedback[feedback.length - 1] = signal;
  } else {
    feedback.push(signal);
  }
  const trimmed = feedback.length > FEEDBACK_CAP ? feedback.slice(-FEEDBACK_CAP) : feedback;
  return { feedback: trimmed };
}

/**
 * Сдвиг сложности из недавних ответов:
 *   в основном «тяжело»  → −1 (подбираем легче)
 *   в основном «мягко»   → +1 (подбираем сложнее)
 *   иначе                →  0
 * Считается по последним RECENT_WINDOW ответам; порог — перевес в 2 голоса.
 */
export function computeDifficultyBias(signals: ProfileSignals): -1 | 0 | 1 {
  const recent = signals.feedback.slice(-RECENT_WINDOW);
  let net = 0; // hard − soft
  for (const item of recent) {
    if (item.rating === 'hard') {
      net += 1;
    } else if (item.rating === 'soft') {
      net -= 1;
    }
  }
  if (net >= 2) {
    return -1;
  }
  if (net <= -2) {
    return 1;
  }
  return 0;
}
