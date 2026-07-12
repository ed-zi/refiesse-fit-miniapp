/**
 * Seed БД контентом из docs/content/content-matrix.md (S0-5):
 * 6 категорий, 13 тренировок (3 free / 10 premium), 3 плана (17 дней-строк).
 *
 * Данные захардкожены как типизированные структуры (источник — content matrix,
 * это seed-шаблон до реальных материалов Кати; все videoUrl — placeholder).
 *
 * Маппинг уровней: в content matrix `easy`/`medium`, в схеме и shared-типах —
 * beginner/medium/advanced. `easy` сидится как `beginner`.
 *
 * Идемпотентен: upsert по slug (категории, тренировки, планы) и по
 * (programId, dayIndex) для дней. Повторный прогон не дублирует данные.
 *
 * Запуск: npm run db:seed (DATABASE_URL из env или apps/api/.env).
 */
import { pathToFileURL } from 'node:url';
import { createPrismaConnection } from '../src/db/prisma.ts';
import type { PrismaClient } from '../src/generated/prisma/client.ts';

interface SeedCategory {
  slug: string;
  title: string;
  sortOrder: number;
}

interface SeedWorkout {
  slug: string;
  title: string;
  goal: string;
  durationMin: number;
  level: 'beginner' | 'medium';
  /** Пустой массив = «без инвентаря» (валидное состояние, см. shared-типы). */
  equipment: string[];
  access: 'free' | 'premium';
  videoUrl: string;
  description: string;
  cautions: string;
  categorySlug: string;
}

interface SeedProgramDay {
  dayIndex: number;
  title: string;
  workoutSlug: string | null;
}

interface SeedProgram {
  slug: string;
  title: string;
  description: string;
  daysTotal: number;
  access: 'free' | 'premium';
  days: SeedProgramDay[];
}

const categories: SeedCategory[] = [
  { slug: 'spina', title: 'Спина', sortOrder: 0 },
  { slug: 'osanka', title: 'Осанка', sortOrder: 1 },
  { slug: 'kor', title: 'Кор', sortOrder: 2 },
  { slug: 'relaxation', title: 'Расслабление', sortOrder: 3 },
  { slug: 'mobility', title: 'Мобильность', sortOrder: 4 },
  { slug: 'lower-back', title: 'Поясница', sortOrder: 5 },
];

const placeholderVideo = (slug: string): string => `https://placeholder/refiesse/${slug}`;

const workouts: SeedWorkout[] = [
  {
    slug: 'neck-shoulders-release',
    title: 'Мягкая разгрузка шеи и плеч',
    goal: 'Снять зажатость шеи и плеч после сидячего дня',
    durationMin: 12,
    level: 'beginner',
    equipment: [],
    access: 'free',
    videoUrl: placeholderVideo('neck-shoulders-release'),
    description:
      'Для тех, кто долго сидел и чувствует зажатость в шее, плечах и верхе спины. Медленные движения, ничего терпеть не нужно.',
    cautions: 'Если есть острая боль, онемение или недавняя травма шеи — не идём через усилие.',
    categorySlug: 'spina',
  },
  {
    slug: 'evening-relax',
    title: 'Вечернее расслабление',
    goal: 'Спокойно замедлиться и подготовиться ко сну',
    durationMin: 9,
    level: 'beginner',
    equipment: [],
    access: 'free',
    videoUrl: placeholderVideo('evening-relax'),
    description:
      'Спокойная вечерняя практика, чтобы замедлиться и мягко отпустить напряжение дня.',
    cautions:
      'Делайте в комфортном темпе. При головокружении лёжа — приподнимите голову и не спешите.',
    categorySlug: 'relaxation',
  },
  {
    slug: 'desk-reset-5',
    title: 'Пятиминутный сброс за столом',
    goal: 'Быстро разгрузить тело в перерыве, не вставая надолго',
    durationMin: 5,
    level: 'beginner',
    equipment: [],
    access: 'free',
    videoUrl: placeholderVideo('desk-reset-5'),
    description:
      'Очень короткая разгрузка в перерыве: немного движения для шеи, плеч и спины, не вставая надолго.',
    cautions: 'Не задерживайте дыхание. Любое движение — только в приятном диапазоне.',
    categorySlug: 'mobility',
  },
  {
    slug: 'thoracic-mobility',
    title: 'Мягкая мобилизация грудного отдела',
    goal: 'Раскрыть верх спины и вернуть подвижность после сидения',
    durationMin: 14,
    level: 'beginner',
    equipment: ['коврик'],
    access: 'premium',
    videoUrl: placeholderVideo('thoracic-mobility'),
    description:
      'Для тех, кто долго сидел и чувствует зажатость в верхе спины. Возвращаем подвижность грудному отделу.',
    cautions: 'При острой боли, онемении или недавней травме — не идём через усилие.',
    categorySlug: 'osanka',
  },
  {
    slug: 'lower-back-after-sitting',
    title: 'Поясница после сидячего дня',
    goal: 'Мягко разгрузить поясницу без нагрузки',
    durationMin: 15,
    level: 'beginner',
    equipment: ['коврик'],
    access: 'premium',
    videoUrl: placeholderVideo('lower-back-after-sitting'),
    description: 'Мягкая разгрузка поясницы после сидячего дня. Без прогибов через боль.',
    cautions:
      'При острой боли в пояснице, простреле или онемении в ногах — остановитесь и не продолжайте.',
    categorySlug: 'lower-back',
  },
  {
    slug: 'core-no-crunches',
    title: 'Кор без скручиваний',
    goal: 'Включить глубокие мышцы корпуса без агрессивных скручиваний',
    durationMin: 18,
    level: 'medium',
    equipment: ['коврик'],
    access: 'premium',
    videoUrl: placeholderVideo('core-no-crunches'),
    description:
      'Работа с глубокими мышцами корпуса без классических скручиваний и нагрузки на шею.',
    cautions:
      'При диастазе, недавней операции или боли в пояснице — выбирайте более мягкий вариант или пропустите.',
    categorySlug: 'kor',
  },
  {
    slug: 'posture-open-chest',
    title: 'Осанка: раскрытие груди',
    goal: 'Раскрыть грудной отдел и разгрузить плечи',
    durationMin: 16,
    level: 'beginner',
    equipment: ['резинка'],
    access: 'premium',
    videoUrl: placeholderVideo('posture-open-chest'),
    description:
      'Раскрываем грудной отдел и плечи, чтобы стало легче держать спину без усилия.',
    cautions: 'Резинку берите мягкую. При боли в плечах — уменьшите амплитуду.',
    categorySlug: 'osanka',
  },
  {
    slug: 'mfr-back-roll',
    title: 'МФР-восстановление для спины',
    goal: 'Прокатать и расслабить спину роллом после нагрузки',
    durationMin: 13,
    level: 'beginner',
    equipment: ['МФР-ролл'],
    access: 'premium',
    videoUrl: placeholderVideo('mfr-back-roll'),
    description:
      'Прокатываем спину роллом, чтобы снять напряжение после нагрузки или долгого дня.',
    cautions: 'Не катайте по пояснице и позвоночнику напрямую. При острой боли — остановитесь.',
    categorySlug: 'spina',
  },
  {
    slug: 'soft-core-breathing',
    title: 'Кор через дыхание',
    goal: 'Мягко активировать центр тела через дыхание',
    durationMin: 12,
    level: 'beginner',
    equipment: ['коврик'],
    access: 'premium',
    videoUrl: placeholderVideo('soft-core-breathing'),
    description: 'Мягко включаем центр тела через дыхание — спокойно и без задержек.',
    cautions: 'Дышите ровно, не задерживайте дыхание. При головокружении сделайте паузу.',
    categorySlug: 'kor',
  },
  {
    slug: 'hips-release',
    title: 'Разгрузка бёдер и таза',
    goal: 'Снять напряжение в бёдрах после долгого сидения',
    durationMin: 17,
    level: 'beginner',
    equipment: ['коврик'],
    access: 'premium',
    videoUrl: placeholderVideo('hips-release'),
    description: 'Снимаем напряжение в бёдрах и тазу, которое копится от долгого сидения.',
    cautions: 'Двигайтесь в комфортной амплитуде. При боли в тазобедренном суставе — мягче.',
    categorySlug: 'mobility',
  },
  {
    slug: 'evening-full-unwind',
    title: 'Вечернее замедление тела',
    goal: 'Пройти полноценную спокойную практику перед сном',
    durationMin: 22,
    level: 'beginner',
    equipment: ['коврик', 'МФР-ролл'],
    access: 'premium',
    videoUrl: placeholderVideo('evening-full-unwind'),
    description:
      'Более длинная спокойная практика на вечер: расслабление тела и дыхания перед сном.',
    cautions: 'Слушайте тело, ничего не форсируйте. Ролл — только по мягким зонам.',
    categorySlug: 'relaxation',
  },
  {
    slug: 'neck-deep-release',
    title: 'Глубокая работа с шеей',
    goal: 'Мягко проработать зажимы шеи и основания черепа',
    durationMin: 15,
    level: 'beginner',
    equipment: [],
    access: 'premium',
    videoUrl: placeholderVideo('neck-deep-release'),
    description: 'Медленная и внимательная работа с зажимами шеи и основанием черепа.',
    cautions:
      'При острой боли, онемении рук или головокружении — прекратите и не продолжайте.',
    categorySlug: 'spina',
  },
  {
    slug: 'posture-band-reset',
    title: 'Осанка с резинкой',
    goal: 'Укрепить мышцы, держащие осанку, мягким сопротивлением',
    durationMin: 20,
    level: 'medium',
    equipment: ['резинка'],
    access: 'premium',
    videoUrl: placeholderVideo('posture-band-reset'),
    description:
      'Мягкое сопротивление резинкой для мышц, которые помогают держать осанку без напряжения.',
    cautions:
      'При боли в плечах или шее уменьшите натяжение резинки или пропустите движение.',
    categorySlug: 'osanka',
  },
];

const programs: SeedProgram[] = [
  {
    slug: 'plan-back-posture-7',
    title: '7 дней для спины и осанки',
    description:
      'Мягкий маршрут, чтобы разгрузить спину и вернуть лёгкую осанку без спортивной нагрузки.',
    daysTotal: 7,
    access: 'premium',
    days: [
      { dayIndex: 1, title: 'Разгрузка шеи и плеч', workoutSlug: 'neck-shoulders-release' },
      { dayIndex: 2, title: 'Подвижность грудного отдела', workoutSlug: 'thoracic-mobility' },
      { dayIndex: 3, title: 'Поясница после сидения', workoutSlug: 'lower-back-after-sitting' },
      { dayIndex: 4, title: 'Раскрытие груди и плеч', workoutSlug: 'posture-open-chest' },
      { dayIndex: 5, title: 'Восстановление роллом', workoutSlug: 'mfr-back-roll' },
      { dayIndex: 6, title: 'Осанка с резинкой', workoutSlug: 'posture-band-reset' },
      { dayIndex: 7, title: 'Спокойное завершение', workoutSlug: 'evening-relax' },
    ],
  },
  {
    slug: 'plan-soft-core-5',
    title: '5 дней мягкого кора',
    description: 'Включить центр тела без скручиваний и агрессии.',
    daysTotal: 5,
    access: 'premium',
    days: [
      { dayIndex: 1, title: 'Кор через дыхание', workoutSlug: 'soft-core-breathing' },
      { dayIndex: 2, title: 'Кор без скручиваний', workoutSlug: 'core-no-crunches' },
      { dayIndex: 3, title: 'Разгрузка бёдер и таза', workoutSlug: 'hips-release' },
      { dayIndex: 4, title: 'Кор без скручиваний (повтор мягче)', workoutSlug: 'core-no-crunches' },
      { dayIndex: 5, title: 'Спокойное завершение', workoutSlug: 'evening-relax' },
    ],
  },
  {
    slug: 'plan-calm-evenings-5',
    title: '5 спокойных вечеров',
    description: 'Вечерний ритуал замедления перед сном.',
    // Free-план как точка входа: первый день free, глубина — premium-карточки
    // (content-matrix 4.3; статус плана — открытый вопрос №4, TODO Кати).
    daysTotal: 5,
    access: 'free',
    days: [
      { dayIndex: 1, title: 'Вечернее расслабление', workoutSlug: 'evening-relax' },
      { dayIndex: 2, title: 'Работа с шеей', workoutSlug: 'neck-deep-release' },
      { dayIndex: 3, title: 'Вечернее расслабление', workoutSlug: 'evening-relax' },
      { dayIndex: 4, title: 'Глубокое замедление тела', workoutSlug: 'evening-full-unwind' },
      { dayIndex: 5, title: 'Вечернее расслабление', workoutSlug: 'evening-relax' },
    ],
  },
];

/** Идемпотентно сидит контент. Используется CLI-запуском и тестовым setup'ом. */
export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  const categoryIdBySlug = new Map<string, string>();
  for (const category of categories) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { title: category.title, sortOrder: category.sortOrder },
    });
    categoryIdBySlug.set(row.slug, row.id);
  }

  const workoutIdBySlug = new Map<string, string>();
  for (const workout of workouts) {
    const categoryId = categoryIdBySlug.get(workout.categorySlug);
    if (!categoryId) {
      throw new Error(`Seed: unknown category slug "${workout.categorySlug}"`);
    }
    const { categorySlug: _categorySlug, ...fields } = workout;
    const data = { ...fields, isPublished: true, categoryId };
    const row = await prisma.workout.upsert({
      where: { slug: workout.slug },
      create: data,
      update: data,
    });
    workoutIdBySlug.set(row.slug, row.id);
  }

  for (const program of programs) {
    const { days, ...fields } = program;
    const row = await prisma.program.upsert({
      where: { slug: program.slug },
      create: { ...fields, isPublished: true },
      update: { ...fields, isPublished: true },
    });

    for (const day of days) {
      const workoutId = day.workoutSlug ? workoutIdBySlug.get(day.workoutSlug) : null;
      if (day.workoutSlug && !workoutId) {
        throw new Error(`Seed: unknown workout slug "${day.workoutSlug}" in ${program.slug}`);
      }
      await prisma.programDay.upsert({
        where: { programId_dayIndex: { programId: row.id, dayIndex: day.dayIndex } },
        create: {
          programId: row.id,
          dayIndex: day.dayIndex,
          title: day.title,
          workoutId: workoutId ?? null,
        },
        update: { title: day.title, workoutId: workoutId ?? null },
      });
    }

    // Если план укоротился между прогонами — подчищаем лишние дни.
    await prisma.programDay.deleteMany({
      where: { programId: row.id, dayIndex: { gt: program.daysTotal } },
    });
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    process.loadEnvFile(new URL('../.env', import.meta.url).pathname);
  } catch {
    // .env отсутствует — используем переменные окружения процесса.
  }
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is required to run the seed');
    process.exit(1);
  }
  const connection = await createPrismaConnection(databaseUrl);
  try {
    await seedDatabase(connection.prisma);
    const [categoryCount, workoutCount, programCount, dayCount] = await Promise.all([
      connection.prisma.category.count(),
      connection.prisma.workout.count(),
      connection.prisma.program.count(),
      connection.prisma.programDay.count(),
    ]);
    console.log(
      `Seed ok: categories=${categoryCount}, workouts=${workoutCount}, programs=${programCount}, programDays=${dayCount}`,
    );
  } finally {
    await connection.close();
  }
}
