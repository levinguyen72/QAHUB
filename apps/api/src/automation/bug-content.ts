import { env } from '../common/config';

type Node = Record<string, unknown>;
const text = (t: string, marks?: Node[]): Node => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
const p = (...content: Node[]): Node => ({ type: 'paragraph', content });
const h = (t: string): Node => ({ type: 'heading', attrs: { level: 3 }, content: [text(t)] });
const code = (t: string): Node => ({ type: 'codeBlock', content: [text(t)] });
const link = (t: string, href: string): Node => text(t, [{ type: 'link', attrs: { href } }]);
// eslint-disable-next-line no-control-regex
const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

export interface BugContentInput {
  file: string;
  line?: number | null;
  titlePath: string[];
  browser?: string | null;
  errorMessage?: string | null;
  errorStack?: string | null;
  errorSnippet?: string | null;
  run: { id: bigint; environment?: string | null; branch?: string | null; commitSha?: string | null; ciUrl?: string | null };
}

/** Tiêu đề: `[Auto] {titlePath nối bằng " › "} — {dòng đầu lỗi}`, cắt còn 255 ký tự. */
export function bugTitle(titlePath: string[], errorMessage?: string | null): string {
  const first = strip(errorMessage ?? '').split('\n')[0].trim();
  const t = `[Auto] ${titlePath.join(' › ')}${first ? ` — ${first}` : ''}`;
  return t.length > 255 ? t.slice(0, 254) + '…' : t;
}

/** Mô tả TipTap JSON của bug auto (mục 8). */
export function bugDescription(i: BugContentInput) {
  const reportUrl = `${env.webOrigin}/reports/runs/${i.run.id}`;
  const stack = strip(i.errorStack ?? '').split('\n').slice(0, 15).join('\n');
  const content: Node[] = [
    p(text('File: ', [{ type: 'bold' }]), text(`${i.file}${i.line ? `:${i.line}` : ''}`)),
    p(text('Browser: ', [{ type: 'bold' }]), text(i.browser ?? '-')),
    p(text('Môi trường: ', [{ type: 'bold' }]), text(`${i.run.environment ?? '-'}, ${i.run.branch ?? '-'}@${i.run.commitSha ?? '-'}`)),
    h('Thông báo lỗi'),
    code(strip(i.errorMessage ?? '(không có)')),
  ];
  if (i.errorSnippet) content.push(h('Đoạn code lỗi'), code(strip(i.errorSnippet)));
  if (stack) content.push(h('Stack trace (thu gọn)'), code(stack));
  content.push(p(text('Lần chạy: ', [{ type: 'bold' }]), link(`Run #${i.run.id}`, reportUrl), ...(i.run.ciUrl ? [text(' · '), link('CI', i.run.ciUrl)] : [])));
  return { type: 'doc', content };
}
