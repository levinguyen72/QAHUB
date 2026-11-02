import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Mở chi tiết item dạng Drawer: đổi URL thành ?selectedIssue=ELMS-2249 (mục 9). */
export function useSelectedIssue() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('selectedIssue');
  const select = useCallback(
    (key: string | null) => {
      setParams((p) => {
        const n = new URLSearchParams(p);
        if (key) n.set('selectedIssue', key); else n.delete('selectedIssue');
        return n;
      }, { replace: false });
    },
    [setParams],
  );
  return { selected, select };
}
