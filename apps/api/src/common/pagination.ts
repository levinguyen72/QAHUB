import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '@ospm/shared';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AppException } from './errors';

export class PaginationQuery {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function clampLimit(limit: number | undefined, max = MAX_PAGE_LIMIT, def = DEFAULT_PAGE_LIMIT): number {
  const n = Number(limit ?? def);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(Math.floor(n), max);
}

export function encodeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toString('base64url');
}

export function decodeCursor<T = any>(cursor?: string | null): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    throw new AppException(400, 'INVALID_CURSOR', 'cursor không hợp lệ');
  }
}

/**
 * Phân trang cursor đơn giản: lấy limit+1 dòng, phần dư cho biết còn trang sau.
 * `cursorOf` tạo cursor từ dòng cuối của trang.
 */
export function toPage<T>(rows: T[], limit: number, cursorOf: (row: T) => unknown): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? encodeCursor(cursorOf(items[items.length - 1])) : null };
}
