/**
 * Мапперы Prisma-моделей в JSON-ответы API.
 *
 * Формат ответов выровнен по типам фронта в packages/shared/src/index.ts
 * (Category, Workout, Program, ProgramDay). packages/shared отсюда НЕ
 * импортируется (синхронизация пакетов — позже); при расхождении меняем
 * маппинг здесь, а не типы фронта.
 */
import type {
  Category,
  Program,
  ProgramDay,
  Workout,
} from './generated/prisma/client.ts';

/** = shared Category. */
export interface CategoryDto {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
}

/**
 * = shared Workout без videoUrl — карточка для списков (каталог).
 * videoUrl в списках не отдаём никому: он есть только в детальной карточке.
 */
export interface WorkoutCardDto {
  id: string;
  slug: string;
  title: string;
  goal: string;
  durationMin: number;
  level: 'beginner' | 'medium' | 'advanced';
  equipment: string[];
  isPremium: boolean;
  description: string;
  cautions: string;
  categorySlug: string;
  thumbColor: string | null;
}

/** Детальная карточка: shared Workout + isLocked. */
export interface WorkoutDetailDto extends WorkoutCardDto {
  /** null, если premium без доступа (метаданные отдаём, контент — нет). */
  videoUrl: string | null;
  /** true = premium-контент закрыт для этого пользователя. */
  isLocked: boolean;
}

/** = shared ProgramDay (workoutSlug вместо внутреннего workoutId). */
export interface ProgramDayDto {
  id: string;
  dayIndex: number;
  title: string;
  workoutSlug: string | null;
}

/** = shared Program. */
export interface ProgramDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  daysTotal: number;
  isPremium: boolean;
  days: ProgramDayDto[];
}

export function toCategoryDto(category: Category): CategoryDto {
  return {
    id: category.id,
    slug: category.slug,
    title: category.title,
    sortOrder: category.sortOrder,
  };
}

type WorkoutWithCategory = Workout & { category: Category };

export function toWorkoutCardDto(workout: WorkoutWithCategory): WorkoutCardDto {
  return {
    id: workout.id,
    slug: workout.slug,
    title: workout.title,
    goal: workout.goal,
    durationMin: workout.durationMin,
    level: workout.level,
    equipment: workout.equipment,
    isPremium: workout.access === 'premium',
    description: workout.description,
    cautions: workout.cautions,
    categorySlug: workout.category.slug,
    thumbColor: workout.thumbColor,
  };
}

export function toWorkoutDetailDto(
  workout: WorkoutWithCategory,
  options: { includeVideo: boolean },
): WorkoutDetailDto {
  return {
    ...toWorkoutCardDto(workout),
    videoUrl: options.includeVideo ? workout.videoUrl : null,
    isLocked: !options.includeVideo,
  };
}

type ProgramWithDays = Program & {
  days: Array<ProgramDay & { workout: { slug: string } | null }>;
};

export function toProgramDto(program: ProgramWithDays): ProgramDto {
  return {
    id: program.id,
    slug: program.slug,
    title: program.title,
    description: program.description,
    daysTotal: program.daysTotal,
    isPremium: program.access === 'premium',
    days: program.days.map((day) => ({
      id: day.id,
      dayIndex: day.dayIndex,
      title: day.title,
      workoutSlug: day.workout?.slug ?? null,
    })),
  };
}
