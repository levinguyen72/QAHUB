import { Breadcrumb } from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { IssueDetailView } from './IssueDetailView';

/** Trang riêng /browse/:issueKey */
export function IssuePage() {
  const { issueKey = '' } = useParams();
  const nav = useNavigate();
  const projectKey = issueKey.slice(0, issueKey.lastIndexOf('-'));
  return (
    <div className="page">
      <Breadcrumb style={{ marginBottom: 12 }} items={[{ title: <Link to="/projects">Dự án</Link> }, { title: <Link to={`/projects/${projectKey}/backlog`}>{projectKey}</Link> }, { title: issueKey }]} />
      <div style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
        <IssueDetailView issueKey={issueKey} onDeleted={() => nav(`/projects/${projectKey}/backlog`)} />
      </div>
    </div>
  );
}
