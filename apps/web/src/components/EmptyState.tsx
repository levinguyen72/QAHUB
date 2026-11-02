import { Empty, Result, Skeleton } from 'antd';
import type { ReactNode } from 'react';

export function EmptyState({ title = 'Chưa có dữ liệu', action }: { title?: string; action?: ReactNode }) {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={title} style={{ padding: 32 }}>{action}</Empty>;
}

export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const msg = (error as any)?.response?.data?.message ?? (error as Error)?.message ?? 'Không tải được dữ liệu';
  return <Result status="warning" title={msg} extra={onRetry && <a onClick={onRetry}>Thử lại</a>} />;
}

/** Bọc một query: loading → Skeleton, lỗi → thông báo, rỗng → EmptyState (mọi danh sách đều cần cả ba trạng thái). */
export function QueryBoundary({ isLoading, error, refetch, empty, emptyTitle, children }: {
  isLoading: boolean; error?: unknown; refetch?: () => void; empty?: boolean; emptyTitle?: string; children: ReactNode;
}) {
  if (isLoading) return <Skeleton active paragraph={{ rows: 6 }} style={{ padding: 16 }} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (empty) return <EmptyState title={emptyTitle} />;
  return <>{children}</>;
}
