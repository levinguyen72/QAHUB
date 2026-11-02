// Backend chưa khai báo schema response đầy đủ (trả object Prisma), nên Orval sinh kiểu response không dùng được.
// Đổi mọi `customInstance<...>(` thành `any`; type của request/DTO vẫn do Orval sinh từ openapi.json.
import { readFileSync, writeFileSync } from 'node:fs';
const f = new URL('../src/api/generated/api.ts', import.meta.url);
writeFileSync(f, readFileSync(f, 'utf8').replace(/customInstance<[^>(]+>\(/g, 'customInstance<any>('));
