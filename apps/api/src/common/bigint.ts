import { ERROR_CODES } from '@ospm/shared';
import { AppException } from './errors';

// Id trong DB là bigint; API trả số thường (id < 2^53).
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

export function parseId(value: unknown, code: string = ERROR_CODES.NOT_FOUND): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  throw new AppException(404, code, 'Không tìm thấy');
}

export function parseIds(values: unknown, code?: string): bigint[] {
  if (values === undefined || values === null || values === '') return [];
  const arr = Array.isArray(values) ? values : String(values).split(',');
  return arr.filter((v) => v !== '').map((v) => parseId(v, code));
}
