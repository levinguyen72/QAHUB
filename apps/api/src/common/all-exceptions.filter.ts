import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES } from '@ospm/shared';
import type { Response } from 'express';

const STATUS_CODES: Record<number, string> = {
  400: ERROR_CODES.VALIDATION_ERROR,
  401: ERROR_CODES.UNAUTHORIZED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: ERROR_CODES.VALIDATION_ERROR,
  429: ERROR_CODES.RATE_LIMITED,
};

/** Mọi lỗi trả về dạng { statusCode, code, message, details? } (mục 4). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let statusCode = 500;
    let code: string = ERROR_CODES.INTERNAL_ERROR;
    let message = 'Lỗi hệ thống';
    let details: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse() as any;
      code = body?.code ?? STATUS_CODES[statusCode] ?? 'ERROR';
      if (typeof body === 'string') message = body;
      else if (Array.isArray(body?.message)) {
        message = 'Dữ liệu không hợp lệ';
        details = body.message;
        code = body?.code ?? ERROR_CODES.VALIDATION_ERROR;
      } else message = body?.message ?? exception.message;
      if (body?.details !== undefined) details = body.details;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        statusCode = 409;
        code = 'CONFLICT';
        message = 'Dữ liệu đã tồn tại';
        details = exception.meta;
      } else if (exception.code === 'P2025') {
        statusCode = 404;
        code = ERROR_CODES.NOT_FOUND;
        message = 'Không tìm thấy';
      } else {
        this.logger.error(exception.message, exception.stack);
      }
    } else {
      this.logger.error((exception as Error)?.message, (exception as Error)?.stack);
    }

    const payload: Record<string, unknown> = { statusCode, code, message };
    if (details !== undefined) payload.details = details;
    res.status(statusCode).json(payload);
  }
}
