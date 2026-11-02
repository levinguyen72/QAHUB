import { App as AntApp, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

export const theme = {
  token: { colorPrimary: '#f51d53', borderRadius: 6, fontFamily: "Inter, -apple-system, 'Segoe UI', Roboto, sans-serif" },
};

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <ConfigProvider locale={viVN} theme={theme}>
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
