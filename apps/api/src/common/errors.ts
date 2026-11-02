import { HttpException } from '@nestjs/common';
import { ERROR_CODES } from '@ospm/shared';

export class AppException extends HttpException {
  constructor(
    statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ statusCode, code, message, details }, statusCode);
  }
}

export const notFound = (code: string, message: string) => new AppException(404, code, message);
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này', code: string = ERROR_CODES.FORBIDDEN) =>
  new AppException(403, code, message);
export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppException(400, code, message, details);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppException(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppException(422, code, message, details);
