import { App, DatePicker, Form, Input, Modal, Radio, Space, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { completeSprint, startSprint, updateSprint } from '../../api/generated/api';
import { errorMessage } from '../../api/http';
import type { Sprint } from '../../api/models';

export function StartSprintModal({ sprint, open, onClose }: { sprint: Sprint | null; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open && sprint) form.setFieldsValue({ range: [dayjs(), dayjs().add(14, 'day')], goal: sprint.goal }); }, [open, sprint, form]);
  return (
    <Modal title={`Bắt đầu ${sprint?.name ?? ''}`} open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={saving} okText="Bắt đầu" cancelText="Hủy" destroyOnClose>
      <Form form={form} layout="vertical" onFinish={async (v) => {
        setSaving(true);
        try { await startSprint(String(sprint!.id), { startDate: v.range[0].format('YYYY-MM-DD'), endDate: v.range[1].format('YYYY-MM-DD'), goal: v.goal }); message.success('Đã bắt đầu sprint'); await qc.invalidateQueries(); onClose(); }
        catch (e) { message.error(errorMessage(e)); } finally { setSaving(false); }
      }}>
        <Form.Item name="range" label="Thời gian" rules={[{ required: true }]}><DatePicker.RangePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="goal" label="Mục tiêu sprint"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  );
}

export function EditSprintModal({ sprint, open, onClose }: { sprint: Sprint | null; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const { message } = App.useApp();
  useEffect(() => { if (open && sprint) form.setFieldsValue({ name: sprint.name, goal: sprint.goal, range: sprint.startDate && sprint.endDate ? [dayjs(sprint.startDate), dayjs(sprint.endDate)] : undefined }); }, [open, sprint, form]);
  return (
    <Modal title="Sửa sprint" open={open} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" cancelText="Hủy" destroyOnClose>
      <Form form={form} layout="vertical" onFinish={async (v) => {
        try { await updateSprint(String(sprint!.id), { name: v.name, goal: v.goal ?? null, startDate: v.range?.[0]?.format('YYYY-MM-DD') ?? null, endDate: v.range?.[1]?.format('YYYY-MM-DD') ?? null }); await qc.invalidateQueries(); onClose(); }
        catch (e) { message.error(errorMessage(e)); }
      }}>
        <Form.Item name="name" label="Tên" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="goal" label="Mục tiêu"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="range" label="Thời gian"><DatePicker.RangePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
      </Form>
    </Modal>
  );
}

/** Complete sprint: hiện số item xong/chưa xong, chọn chuyển item chưa xong về Backlog hoặc sprint kế tiếp (mục 10). */
export function CompleteSprintModal({ sprint, done, open, notDone, futureSprints, onClose }: {
  sprint: Sprint | null; done: number; notDone: number; open: boolean; futureSprints: Sprint[]; onClose: () => void;
}) {
  const [target, setTarget] = useState<string>('backlog');
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const { message } = App.useApp();
  useEffect(() => { if (open) setTarget('backlog'); }, [open]);
  return (
    <Modal title={`Hoàn thành ${sprint?.name ?? ''}`} open={open} onCancel={onClose} okText="Hoàn thành sprint" cancelText="Hủy" confirmLoading={saving} destroyOnClose
      onOk={async () => {
        setSaving(true);
        try { await completeSprint(String(sprint!.id), { moveOpenIssuesTo: target }); message.success('Đã hoàn thành sprint'); await qc.invalidateQueries(); onClose(); }
        catch (e) { message.error(errorMessage(e)); } finally { setSaving(false); }
      }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text><b>{done}</b> item đã xong, <b>{notDone}</b> item chưa xong.</Typography.Text>
        {notDone > 0 && (
          <>
            <Typography.Text>Chuyển các item chưa xong tới:</Typography.Text>
            <Radio.Group value={target} onChange={(e) => setTarget(e.target.value)}>
              <Space direction="vertical">
                <Radio value="backlog">Backlog</Radio>
                {futureSprints.map((s) => <Radio key={s.id} value={String(s.id)}>{s.name}</Radio>)}
              </Space>
            </Radio.Group>
          </>
        )}
      </Space>
    </Modal>
  );
}
