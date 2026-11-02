import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AvatarFilter } from './AvatarFilter';
import { SourceTag } from './SourceTag';
import { StatusTag } from './StatusTag';

describe('SourceTag', () => {
  it('auto có biểu tượng robot, manual là tag xám', () => {
    const { rerender, container } = render(<SourceTag source="auto" />);
    expect(screen.getByText('auto')).toBeInTheDocument();
    expect(container.querySelector('.anticon-robot')).not.toBeNull();
    rerender(<SourceTag source="manual" />);
    expect(screen.getByText('manual')).toBeInTheDocument();
    expect(container.querySelector('.anticon-robot')).toBeNull();
  });
});

describe('StatusTag', () => {
  it('chỉ liệt kê availableTransitions và gọi onTransition', async () => {
    const onTransition = vi.fn();
    render(<StatusTag status={{ name: 'To Do', color: '#999' }} transitions={[{ statusId: 7, name: 'In Progress', category: 'in_progress', color: '#1677ff', label: 'Start progress' }]} onTransition={onTransition} />);
    fireEvent.click(screen.getByText('To Do'));
    const item = await screen.findByText('Start progress → In Progress');
    fireEvent.click(item);
    expect(onTransition).toHaveBeenCalledWith(7);
  });
  it('không có onTransition thì chỉ hiển thị', () => {
    render(<StatusTag status={{ name: 'Done', color: '#52c41a' }} />);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });
});

describe('AvatarFilter', () => {
  const users = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, displayName: `User ${i + 1}` }));
  it('hiện tối đa 6 avatar rồi +n', () => {
    render(<AvatarFilter users={users} value={[]} onChange={() => undefined} />);
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(screen.getByText('+3')).toBeInTheDocument();
  });
  it('bấm để bật/tắt lọc theo assignee', () => {
    const onChange = vi.fn();
    const { rerender } = render(<AvatarFilter users={users} value={[]} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button')[1]);
    expect(onChange).toHaveBeenLastCalledWith([2]);
    rerender(<AvatarFilter users={users} value={[2]} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button')[1]);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
