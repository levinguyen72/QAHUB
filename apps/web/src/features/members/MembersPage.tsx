import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Popconfirm, Select, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PROJECT_ROLES, SYSTEM_ROLES } from '@ospm/shared';
import {
  addProjectMember, createUser, removeProjectMember, resetUserPassword, updateProjectMember, updateUser,
} from '../../api/generated/api';
import { errorMessage } from '../../api/http';
import { useAllUsers, useMembers } from '../../api/hooks';
import { UserAvatar } from '../../components/UserAvatar';
import { fmtDateTime } from '../../lib/date';
import { useAuth } from '../auth/authStore';

export function MembersPage() {
  const isAdmin = useAuth((s) => s.isSystemAdmin());
  const adminProjects = useAuth((s) => s.projects).filter((p) => p.role === 'admin');
  const [projectKey, setProjectKey] = useState<string | undefined>(adminProjects[0]?.projectKey);
  const { data: all } = useQuery<any[]>({ queryKey: ['projects'], queryFn: async () => (await import('../../api/generated/api')).listProjects(), enabled: isAdmin });
  const projectOptions = isAdmin ? (all ?? []).map((p) => ({ value: p.key, label: `${p.key} — ${p.name}` })) : adminProjects.map((p) => ({ value: p.projectKey, label: `${p.projectKey} — ${p.projectName}` }));
  const key = projectKey ?? projectOptions[0]?.value;
  return (
    <div className="page">
      <Typography.Title level={3} style={{ marginTop: 0 }}>Member</Typography.Title>
      <Tabs items={[
        ...(isAdmin ? [{ key: 'users', label: 'Người dùng', children: <UsersTab /> }] : []),
        { key: 'project', label: 'Thành viên dự án', children: (
          <>
            <Select style={{ width: 300, marginBottom: 12 }} value={key} onChange={setProjectKey} options={projectOptions} placeholder="Chọn dự án" />
            {key && <ProjectMembersTab projectKey={key} />}
          </>
        ) },
      ]} />
    </div>
  );
}

function UsersTab() {
  const { data = [], isLoading } = useAllUsers();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const { message, modal } = App.useApp();
  const me = useAuth((s) => s.user);
  return (
    <>
      <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setOpen(true)}>Thêm người dùng</Button>
      <Table rowKey="id" loading={isLoading} dataSource={data} pagination={false} size="middle" style={{ background: '#fff' }} columns={[
        { title: 'Tên', dataIndex: 'displayName', render: (_, u: any) => <UserAvatar user={u} showName /> },
        { title: 'Email', dataIndex: 'email' },
        { title: 'Vai trò hệ thống', dataIndex: 'systemRole', render: (r, u: any) => (
          <Select size="small" value={r} style={{ width: 110 }} disabled={u.id === me?.id} options={SYSTEM_ROLES.map((x) => ({ value: x, label: x }))}
            onChange={async (v) => { try { await updateUser(String(u.id), { systemRole: v }); await qc.invalidateQueries({ queryKey: ['users'] }); } catch (e) { message.error(errorMessage(e)); } }} />
        ) },
        { title: 'Trạng thái', dataIndex: 'isActive', render: (a, u: any) => (
          <Switch checked={a} disabled={u.id === me?.id} checkedChildren="Hoạt động" unCheckedChildren="Đã khóa"
            onChange={async (v) => { try { await updateUser(String(u.id), { isActive: v }); await qc.invalidateQueries({ queryKey: ['users'] }); } catch (e) { message.error(errorMessage(e)); } }} />
        ) },
        { title: 'Đăng nhập cuối', dataIndex: 'lastLoginAt', render: fmtDateTime },
        { title: '', render: (_, u: any) => (
          <Popconfirm title="Đặt lại mật khẩu cho người dùng này?" onConfirm={async () => {
            try { const r = await resetUserPassword(String(u.id)); modal.info({ title: 'Mật khẩu tạm', content: <div>Chỉ hiển thị một lần:<br /><Typography.Text copyable code>{r.temporaryPassword}</Typography.Text></div> }); }
            catch (e) { message.error(errorMessage(e)); }
          }}><a>Đặt lại mật khẩu</a></Popconfirm>
        ) },
      ]} />
      <Modal title="Thêm người dùng" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Tạo" cancelText="Hủy" destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ systemRole: 'member' }} onFinish={async (v) => {
          try { await createUser(v); message.success('Đã tạo người dùng'); await qc.invalidateQueries({ queryKey: ['users'] }); setOpen(false); form.resetFields(); } catch (e) { message.error(errorMessage(e)); }
        }}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="displayName" label="Tên hiển thị" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="systemRole" label="Vai trò hệ thống"><Select options={SYSTEM_ROLES.map((x) => ({ value: x, label: x }))} /></Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, min: 8, message: 'Tối thiểu 8 ký tự' }]}><Input.Password /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function ProjectMembersTab({ projectKey }: { projectKey: string }) {
  const { data = [], isLoading } = useMembers(projectKey);
  const { data: users = [] } = useAllUsers();
  const [userId, setUserId] = useState<number>();
  const [role, setRole] = useState<string>('developer');
  const qc = useQueryClient();
  const { message } = App.useApp();
  const reloadMe = useAuth((s) => s.reload);
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['members', projectKey] }); await reloadMe(); };
  const taken = new Set(data.map((m) => m.userId));
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Select showSearch optionFilterProp="label" placeholder="Chọn người dùng" style={{ width: 260 }} value={userId} onChange={setUserId}
          options={users.filter((u) => u.isActive && !taken.has(u.id)).map((u) => ({ value: u.id, label: `${u.displayName} (${u.email})` }))} />
        <Select style={{ width: 140 }} value={role} onChange={setRole} options={PROJECT_ROLES.map((r) => ({ value: r, label: r }))} />
        <Button type="primary" icon={<PlusOutlined />} disabled={!userId} onClick={async () => { try { await addProjectMember(projectKey, { userId: userId!, role: role as any }); setUserId(undefined); await refresh(); } catch (e) { message.error(errorMessage(e)); } }}>Thêm</Button>
      </div>
      <Table rowKey="userId" loading={isLoading} dataSource={data} pagination={false} style={{ background: '#fff' }} columns={[
        { title: 'Thành viên', render: (_, m) => <UserAvatar user={m.user} showName /> },
        { title: 'Email', render: (_, m) => m.user.email },
        { title: 'Vai trò', dataIndex: 'role', render: (r, m) => (
          <Select size="small" style={{ width: 130 }} value={r} options={PROJECT_ROLES.map((x) => ({ value: x, label: x }))}
            onChange={async (v) => { try { await updateProjectMember(projectKey, String(m.userId), { role: v as any }); await refresh(); } catch (e) { message.error(errorMessage(e)); } }} />
        ) },
        { title: '', render: (_, m) => (
          <Popconfirm title="Gỡ thành viên khỏi dự án?" okButtonProps={{ danger: true }} onConfirm={async () => { try { await removeProjectMember(projectKey, String(m.userId)); await refresh(); } catch (e) { message.error(errorMessage(e)); } }}><a style={{ color: '#f5222d' }}>Gỡ</a></Popconfirm>
        ) },
      ]} />
      <Tag style={{ marginTop: 8 }}>admin: toàn quyền dự án · tester: duyệt bug, xóa test case · developer: tạo/sửa item · viewer: chỉ xem</Tag>
    </>
  );
}
