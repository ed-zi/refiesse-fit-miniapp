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

/** Ответ на недельный лёгкий чек-ин «Как прошла неделя?». */
export type CheckinAnswer = 'better' | 'same' | 'harder';

/** Одна запись недельного чек-ина. */
export interface CheckinSignal {
  answer: CheckinAnswer;
  /** ISO-строка момента ответа (UTC). */
  at: string;
}

/** Накопленные сигналы живого профиля (то, что лежит в User.profileSignals). */
export interface ProfileSignals {
  feedback: FeedbackSignal[];
  /** Недельные чек-ины (WEEK-1). Новые в конце. */
  checkins: CheckinSignal[];
}

/** Сколько недельных чек-инов храним. */
export const CHECKIN_CAP = 12;

/** Через сколько дней после последнего чек-ина показываем следующий. */
export const CHECKIN_PERIOD_DAYS = 7;

/** Сколько последних ответов храним (хвост обрезаем). */
export const FEEDBACK_CAP = 30;

/** Окно «недавних» ответов, по которым считаем сдвиг сложности. */
export const RECENT_WINDOW = 5;

/** Пустой профиль. */
export function emptyProfileSignals(): ProfileSignals {
  return { feedback: [], checkins: [] };
}

function isFeedbackRating(value: unknown): value is FeedbackRating {
  return value === 'soft' || value === 'right' || value === 'hard';
}

function isCheckinAnswer(value: unknown): value is CheckinAnswer {
  return value === 'better' || value === 'same' || value === 'harder';
}

/** Безопасно читает profileSignals-JSON из БД; повреждённое/пустое → пустой профиль. */
export function parseProfileSignals(value: unknown): ProfileSignals {
  if (typeof value !== 'object' || value === null) {
    return emptyProfileSignals();
  }
  const obj = value as Record<string, unknown>;

  const feedback: FeedbackSignal[] = [];
  if (Array.isArray(obj['feedback'])) {
    for (const item of obj['feedback']) {
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
  }

  const checkins: CheckinSignal[] = [];
  if (Array.isArray(obj['checkins'])) {
    for (const item of obj['checkins']) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }
      const entry = item as Record<string, unknown>;
      const answer = entry['answer'];
      const at = entry['at'];
      if (isCheckinAnswer(answer) && typeof at === 'string') {
        checkins.push({ answer, at });
      }
    }
  }

  return { feedback, checkins };
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
  return { ...existing, feedback: trimmed };
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

/** Добавляет недельный чек-ин (новый в конце), обрезая до CHECKIN_CAP. */
export function appendCheckin(existing: ProfileSignals, signal: CheckinSignal): ProfileSignals {
  const checkins = [...existing.checkins, signal];
  const trimmed = checkins.length > CHECKIN_CAP ? checkins.slice(-CHECKIN_CAP) : checkins;
  return { ...existing, checkins: trimmed };
}

/** Последний недельный чек-ин (или null). */
export function latestCheckin(signals: ProfileSignals): CheckinSignal | null {
  return signals.checkins[signals.checkins.length - 1] ?? null;
}

/** Целых дней между двумя моментами. */
function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Пора ли показывать недельный чек-ин: не было ни одного или прошло
 * ≥ CHECKIN_PERIOD_DAYS с последнего. accountCreatedAt: не тревожим совсем
 * новых — первые CHECKIN_PERIOD_DAYS дней после регистрации чек-ин не показываем.
 */
export function isCheckinDue(
  signals: ProfileSignals,
  accountCreatedAt: Date,
  now: Date = new Date(),
): boolean {
  if (daysBetween(accountCreatedAt, now) < CHECKIN_PERIOD_DAYS) {
    return false;
  }
  const last = latestCheckin(signals);
  if (last === null) {
    return true;
  }
  const lastAt = new Date(last.at);
  if (Number.isNaN(lastAt.getTime())) {
    return true;
  }
  return daysBetween(lastAt, now) >= CHECKIN_PERIOD_DAYS;
}

/**
 * Мягкий сдвиг сложности из последнего недельного чек-ина: «тяжелее» → −1
 * (легче), «полегче/лучше» → +1 (можно сложнее), «так же» → 0.
 */
export function weeklyEasing(signals: ProfileSignals): -1 | 0 | 1 {
  const last = latestCheckin(signals);
  if (last === null) {
    return 0;
  }
  if (last.answer === 'harder') {
    return -1;
  }
  if (last.answer === 'better') {
    return 1;
  }
  return 0;
}
