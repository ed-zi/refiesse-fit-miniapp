import { describe, expect, it } from 'vitest';
import { InitDataError, verifyInitData } from '../src/telegram/verifyInitData.ts';
import { buildInitData, TEST_BOT_TOKEN } from './helpers.ts';

describe('verifyInitData', () => {
  it('принимает валидный initData и возвращает пользователя', () => {
    const authDate = Math.floor(Date.now() / 1000) - 60;
    const initData = buildInitData({
      user: { id: 424242, first_name: 'Rita', username: 'rita_fit', language_code: 'ru' },
      authDate,
    });

    const result = verifyInitData(initData, TEST_BOT_TOKEN);

    expect(result.user).toEqual({
      id: 424242,
      firstName: 'Rita',
      lastName: undefined,
      username: 'rita_fit',
      languageCode: 'ru',
    });
    expect(result.authDate.getTime()).toBe(authDate * 1000);
  });

  it('отклоняет подделанный hash', () => {
    const initData = buildInitData({ overrideHash: 'a'.repeat(64) });

    expect(() => verifyInitData(initData, TEST_BOT_TOKEN)).toThrowError(InitDataError);
    try {
      verifyInitData(initData, TEST_BOT_TOKEN);
    } catch (err) {
      expect((err as InitDataError).reason).toBe('HASH_MISMATCH');
    }
  });

  it('отклоняет подпись под чужой bot token', () => {
    const initData = buildInitData({ botToken: '999:OTHER-BOT-TOKEN' });

    expect(() => verifyInitData(initData, TEST_BOT_TOKEN)).toThrowError(InitDataError);
  });

  it('отклоняет изменённые данные при валидном по формату hash', () => {
    const initData = buildInitData();
    const tampered = initData.replace('Rita', 'Evil');

    expect(() => verifyInitData(tampered, TEST_BOT_TOKEN)).toThrowError(InitDataError);
  });

  it('отклоняет просроченный auth_date (старше max age)', () => {
    const initData = buildInitData({
      authDate: Math.floor(Date.now() / 1000) - 25 * 60 * 60, // 25 часов назад
    });

    try {
      verifyInitData(initData, TEST_BOT_TOKEN);
      expect.unreachable('должен был кинуть InitDataError');
    } catch (err) {
      expect(err).toBeInstanceOf(InitDataError);
      expect((err as InitDataError).reason).toBe('AUTH_DATE_EXPIRED');
    }
  });

  it('уважает конфигурируемый maxAgeSeconds', () => {
    const initData = buildInitData({ authDate: Math.floor(Date.now() / 1000) - 120 });

    // 2 минуты назад: с лимитом 60с — просрочен, с лимитом 300с — валиден.
    expect(() =>
      verifyInitData(initData, TEST_BOT_TOKEN, { maxAgeSeconds: 60 }),
    ).toThrowError(InitDataError);
    expect(() =>
      verifyInitData(initData, TEST_BOT_TOKEN, { maxAgeSeconds: 300 }),
    ).not.toThrow();
  });

  it('отклоняет initData без hash', () => {
    try {
      verifyInitData('user=%7B%22id%22%3A1%7D&auth_date=1', TEST_BOT_TOKEN);
      expect.unreachable('должен был кинуть InitDataError');
    } catch (err) {
      expect((err as InitDataError).reason).toBe('HASH_MISSING');
    }
  });
});
