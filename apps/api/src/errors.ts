/**
 * Прикладная ошибка с HTTP-статусом и машинным кодом.
 * setErrorHandler в app.ts превращает её в единый формат
 * { error: { code, message } }.
 */
export class AppError extends Error {
  override name = 'AppError';
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
