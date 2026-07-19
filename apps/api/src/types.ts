/**
 * Локальные API-типы (DTO ответов).
 *
 * ВНИМАНИЕ: общий контракт фронт<->бэк позже переедет в packages/shared
 * (см. architecture.md §2). До синхронизации типы живут здесь и не
 * импортируются из других workspace-пакетов.
 */
import type { User } from './generated/prisma/client.ts';

/** Пользователь в ответах API. BigInt telegramUserId сериализуем строкой. */
export interface UserDto {
  id: string;
  telegramUserId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  languageCode: string | null;
  isAdmin: boolean;
  createdAt: string;
}

/** Заглушка доступа до Спринта 3 (Tribute/Subscription). = shared AccessStatus. */
export interface AccessStatus {
  isPremium: boolean;
  status: 'active' | 'cancelled' | 'expired' | 'none';
  expiresAt: string | null;
}

/** = shared OnboardingAnswers (расширено под квиз RP-1). */
export interface OnboardingAnswers {
  goal: string;
  time: string;
  /** Мультивыбор; пустой массив = «без инвентаря» (валидное состояние). */
  equipment: string[];
  /** Легаси старого квиза — необязательно. */
  intensity?: string;
  /** Новый квиз: уровень. */
  level?: string;
  /** Новый квиз: частота. */
  frequency?: string;
}

/** = shared UserProfile (плоский ответ GET /me). */
export interface UserProfile {
  id: string;
  telegramUserId: number | null;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  onboarding: OnboardingAnswers | null;
  access: AccessStatus;
  /** Эффективный признак админа (user.isAdmin ИЛИ telegram id в ADMIN_TELEGRAM_IDS). */
  isAdmin: boolean;
}

export interface AuthResponse {
  token: string;
  expiresIn: string;
  user: UserDto;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export function serializeUser(user: User): UserDto {
  return {
    id: user.id,
    telegramUserId: user.telegramUserId.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    languageCode: user.languageCode,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt.toISOString(),
  };
}
