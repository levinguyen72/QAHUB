import { Spin } from 'antd';
import { useEffect } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { ApiKeysPage } from '../features/api-keys/ApiKeysPage';
import LoginPage from '../features/auth/LoginPage';
import { useAuth } from '../features/auth/authStore';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { IssuePage } from '../features/issues/IssuePage';
import { MembersPage } from '../features/members/MembersPage';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { RunDetailPage } from '../features/reports/RunDetailPage';
import { SettingsLayout, SettingsRedirect } from '../features/settings/SettingsLayout';
import { GeneralSettings } from '../features/settings/GeneralSettings';
import { LabelSettings } from '../features/settings/LabelSettings';
import { WorkflowSettings } from '../features/settings/WorkflowSettings';
import { AppLayout } from './AppLayout';
import { ProjectLayout, projectTabs } from './ProjectLayout';

/** Chặn truy cập khi chưa đăng nhập; khôi phục phiên bằng refresh token khi tải lại trang. */
function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, ready, init } = useAuth();
  const loc = useLocation();
  useEffect(() => { if (!ready) void init(); }, [ready, init]);
  if (!ready) return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}><Spin size="large" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return children;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <RequireAuth><AppLayout /></RequireAuth>,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      {
        path: 'projects/:projectKey',
        element: <ProjectLayout />,
        children: [
          { index: true, element: <Navigate to="summary" replace /> },
          ...projectTabs.map((t) => ({ path: t.path, element: <t.element /> })),
        ],
      },
      { path: 'browse/:issueKey', element: <IssuePage /> },
      { path: 'members', element: <MembersPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'reports/runs/:runId', element: <RunDetailPage /> },
      { path: 'api-keys', element: <ApiKeysPage /> },
      { path: 'settings', element: <SettingsRedirect /> },
      {
        path: 'settings/projects/:projectKey',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="workflow" replace /> },
          { path: 'workflow', element: <WorkflowSettings /> },
          { path: 'general', element: <GeneralSettings /> },
          { path: 'labels', element: <LabelSettings /> },
        ],
      },
    ],
  },
]);
