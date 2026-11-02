import { defineConfig } from 'orval';

// Sinh hook TanStack Query từ openapi.json do API xuất ra (pnpm openapi). Không sửa tay thư mục generated.
export default defineConfig({
  ospm: {
    input: { target: '../api/openapi.json' },
    output: {
      mode: 'single',
      target: 'src/api/generated/api.ts',
      schemas: 'src/api/generated/model',
      client: 'react-query',
      clean: true,
      override: {
        mutator: { path: 'src/api/http.ts', name: 'customInstance' },
        query: { useQuery: true, useMutation: true },
      },
    },
  },
});
