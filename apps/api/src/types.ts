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

/** Заглушка доступа до Спринта 3 (Tribute/Subscription). */
export interface AccessDto {
  tier: 'free';
}

export interface AuthResponse {
  token: string;
  expiresIn: string;
  user: UserDto;
}

export interface MeResponse {
  user: UserDto;
  access: AccessDto;
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
