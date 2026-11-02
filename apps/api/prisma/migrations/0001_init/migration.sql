-- Migration 0001: DDL chuẩn từ mục 5 của đặc tả
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===== Người dùng =====
CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  avatar_url    text,
  password_hash text NOT NULL,
  system_role   text NOT NULL DEFAULT 'member' CHECK (system_role IN ('admin','member')),
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ===== Dự án =====
CREATE TABLE projects (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key          text NOT NULL UNIQUE CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'), -- 'ELMS'
  name         text NOT NULL,
  description  text,
  lead_id      bigint REFERENCES users(id),
  issue_seq    bigint NOT NULL DEFAULT 0,      -- số cuối cùng đã cấp cho mã item
  settings     jsonb NOT NULL DEFAULT '{}',    -- {createBugForFlaky: false}
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE TABLE project_members (
  project_id  bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('admin','developer','tester','viewer')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

-- ===== Workflow (mục 6) =====
CREATE TABLE workflow_statuses (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,                 -- 'Pending Review', 'To Do', 'In QA'
  category    text NOT NULL CHECK (category IN ('triage','todo','in_progress','done')),
  color       text NOT NULL DEFAULT '#8c8c8c',
  position    int  NOT NULL,                 -- thứ tự cột trên board
  show_on_board boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  UNIQUE (project_id, name)
);

CREATE TABLE workflow_transitions (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id      bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_status_id  bigint REFERENCES workflow_statuses(id) ON DELETE CASCADE, -- NULL = từ mọi trạng thái
  to_status_id    bigint NOT NULL REFERENCES workflow_statuses(id) ON DELETE CASCADE,
  name            text,                      -- nhãn nút, ví dụ 'Accept', 'Start progress'
  UNIQUE (project_id, from_status_id, to_status_id)
);

CREATE TABLE workflow_settings (
  project_id               bigint PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  initial_manual_status_id bigint NOT NULL REFERENCES workflow_statuses(id),
  initial_auto_status_id   bigint NOT NULL REFERENCES workflow_statuses(id),
  accept_status_id         bigint REFERENCES workflow_statuses(id), -- đích khi Accept bug auto
  reject_status_id         bigint REFERENCES workflow_statuses(id), -- đích khi Reject/Duplicate
  allow_any_transition     boolean NOT NULL DEFAULT false,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflow_templates (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  definition  jsonb NOT NULL,  -- {statuses:[{key,name,category,color}], transitions:[{from,to,name}], initialManual, initialAuto, accept, reject}
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ===== Sprint & label =====
CREATE TABLE sprints (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id    bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          text NOT NULL,                -- 'ELMS Sprint 22'
  goal          text,
  state         text NOT NULL DEFAULT 'future' CHECK (state IN ('future','active','closed')),
  start_date    date,
  end_date      date,
  completed_at  timestamptz,
  position      int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX one_active_sprint ON sprints(project_id) WHERE state = 'active' AND deleted_at IS NULL;

CREATE TABLE labels (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,                   -- 'manual', 'auto', 'qa-pending', 'qa-retest-20261014'
  color       text NOT NULL DEFAULT '#1677ff',
  is_system   boolean NOT NULL DEFAULT false,  -- 'manual' và 'auto' là label hệ thống
  UNIQUE (project_id, name)
);

-- ===== Work item =====
CREATE TABLE issues (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id       bigint NOT NULL REFERENCES projects(id),
  number           bigint NOT NULL,             -- 2249 -> ELMS-2249
  type             text NOT NULL CHECK (type IN ('epic','story','task','bug','subtask')),
  title            text NOT NULL CHECK (char_length(title) <= 255),
  description      jsonb,                       -- TipTap JSON
  status_id        bigint NOT NULL REFERENCES workflow_statuses(id),
  priority         text NOT NULL DEFAULT 'medium' CHECK (priority IN ('highest','high','medium','low','lowest')),
  source           text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','auto')),
  assignee_id      bigint REFERENCES users(id),
  reporter_id      bigint REFERENCES users(id),  -- NULL nếu tạo bằng API key
  created_by_api_key_id uuid,                    -- FK tới api_keys, khai báo bên dưới
  parent_id        bigint REFERENCES issues(id), -- subtask -> cha; story/task/bug -> epic
  sprint_id        bigint REFERENCES sprints(id),
  rank             text NOT NULL,                -- LexoRank cho backlog và board
  estimate_minutes int,
  due_date         date,
  resolution       text CHECK (resolution IN ('done','rejected','duplicate','wont_fix')),
  duplicate_of_id  bigint REFERENCES issues(id),
  -- trường dành cho bug auto
  fingerprint      text,
  occurrence_count int NOT NULL DEFAULT 1,
  first_seen_at    timestamptz,
  last_seen_at     timestamptz,
  version          int NOT NULL DEFAULT 1,
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  search_text      tsvector GENERATED ALWAYS AS (to_tsvector('simple', title)) STORED,
  UNIQUE (project_id, number)
);

CREATE TABLE issue_labels (
  issue_id  bigint NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  label_id  bigint NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (issue_id, label_id)
);

CREATE TABLE issue_links (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id  bigint NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  target_id  bigint NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('relates','blocks','duplicates','regression_of')),
  UNIQUE (source_id, target_id, type)
);

CREATE TABLE issue_comments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issue_id    bigint NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_id   bigint REFERENCES users(id),     -- NULL = hệ thống (ví dụ 'Xuất hiện lại ở run #45')
  body        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TABLE issue_status_changes (     -- dùng cho Summary và báo cáo thời gian xử lý
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issue_id        bigint NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  from_status_id  bigint REFERENCES workflow_statuses(id),
  to_status_id    bigint NOT NULL REFERENCES workflow_statuses(id),
  changed_by      bigint REFERENCES users(id),
  changed_at      timestamptz NOT NULL DEFAULT now()
);

-- ===== API key =====
CREATE TABLE api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          text NOT NULL,                 -- 'GitLab CI - nightly'
  prefix        text NOT NULL UNIQUE,          -- 12 ký tự đầu, ví dụ 'pmk_live_a1b2'
  key_hash      text NOT NULL UNIQUE,          -- sha256 của key đầy đủ
  scopes        text[] NOT NULL DEFAULT '{runs:write}',
  expires_at    timestamptz,
  last_used_at  timestamptz,
  last_used_ip  inet,
  created_by    bigint NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  revoked_by    bigint REFERENCES users(id)
);
ALTER TABLE issues ADD CONSTRAINT issues_api_key_fk FOREIGN KEY (created_by_api_key_id) REFERENCES api_keys(id);

-- ===== Report: kết quả Playwright =====
CREATE TABLE automation_runs (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id     bigint NOT NULL REFERENCES projects(id),
  external_id    text NOT NULL,                -- ID pipeline CI, dùng cho idempotency
  name           text,
  branch         text,
  commit_sha     text,
  environment    text,                         -- 'staging', 'uat'
  ci_url         text,
  status         text NOT NULL DEFAULT 'receiving'
                 CHECK (status IN ('receiving','processing','completed','failed')),
  total          int NOT NULL DEFAULT 0,
  passed         int NOT NULL DEFAULT 0,
  failed         int NOT NULL DEFAULT 0,
  flaky          int NOT NULL DEFAULT 0,
  skipped        int NOT NULL DEFAULT 0,
  bugs_created   int NOT NULL DEFAULT 0,
  bugs_updated   int NOT NULL DEFAULT 0,
  duration_ms    bigint,
  started_at     timestamptz,
  finished_at    timestamptz,
  processing_error text,
  api_key_id     uuid REFERENCES api_keys(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_id)
);

CREATE TABLE automation_results (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id        bigint NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  test_id       text NOT NULL,                 -- testCase.id của Playwright
  file          text NOT NULL,                 -- 'tests/student/exam.spec.ts'
  line          int,
  title_path    text[] NOT NULL,               -- ['Học sinh','Bài kiểm tra','Điểm số hiển thị']
  browser       text,                          -- tên project Playwright: 'chromium'
  status        text NOT NULL CHECK (status IN ('passed','failed','timedOut','skipped','interrupted','flaky')),
  retries       int NOT NULL DEFAULT 0,
  duration_ms   int,
  error_message text,
  error_stack   text,
  error_snippet text,
  tags          text[] NOT NULL DEFAULT '{}',  -- '@smoke', '@CL_NDS-U-00796-020'
  fingerprint   text,
  issue_id      bigint REFERENCES issues(id),  -- bug được tạo hoặc cập nhật từ kết quả này
  issue_action  text CHECK (issue_action IN ('created','updated','skipped_flaky','none'))
);

-- ===== File đính kèm (nội dung trên MinIO) =====
CREATE TABLE attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    bigint NOT NULL REFERENCES projects(id),
  entity        text NOT NULL CHECK (entity IN ('issue','comment','automation_result')),
  entity_id     bigint NOT NULL,
  kind          text NOT NULL DEFAULT 'file' CHECK (kind IN ('file','screenshot','video','trace')),
  object_key    text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    bigint,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
  uploaded_by   bigint REFERENCES users(id),
  uploaded_by_api_key_id uuid REFERENCES api_keys(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ===== Nhật ký =====
CREATE TABLE activity_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  bigint REFERENCES projects(id),
  entity      text NOT NULL,                  -- 'issue' | 'sprint' | 'project' | 'workflow' | 'api_key'
  entity_id   text NOT NULL,
  action      text NOT NULL,                  -- 'created' | 'updated' | 'status_changed' | 'commented' | 'triaged' ...
  changes     jsonb,                          -- {field: [old, new]}
  actor_id    bigint REFERENCES users(id),
  actor_api_key_id uuid REFERENCES api_keys(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ===== Index =====
CREATE INDEX ON issues (project_id, sprint_id, rank) WHERE deleted_at IS NULL;
CREATE INDEX ON issues (project_id, status_id) WHERE deleted_at IS NULL;
CREATE INDEX ON issues (project_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ON issues (assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX ON issues (parent_id) WHERE deleted_at IS NULL;
CREATE INDEX ON issues (project_id, fingerprint) WHERE fingerprint IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ON issues USING gin (search_text);
CREATE INDEX ON issues USING gin (title gin_trgm_ops);
CREATE INDEX ON issue_labels (label_id);
CREATE INDEX ON issue_comments (issue_id, created_at);
CREATE INDEX ON issue_status_changes (issue_id, changed_at);
CREATE INDEX ON issue_status_changes (to_status_id, changed_at);
CREATE INDEX ON automation_runs (project_id, created_at DESC);
CREATE INDEX ON automation_results (run_id, status);
CREATE INDEX ON automation_results (fingerprint);
CREATE INDEX ON attachments (entity, entity_id);
CREATE INDEX ON activity_log (project_id, created_at DESC);
CREATE INDEX ON activity_log (entity, entity_id, created_at DESC);

-- ===== Test cases =====
-- Epic & Function từ tài liệu BA
CREATE TABLE requirements (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id     bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('epic','function')),
  code           text NOT NULL,                -- 'NDS-E-00946' | 'NDS-U-00796'
  name           text NOT NULL,
  trace_ref      text,                         -- 'UC 48, BA_MENU_TRACEABILITY Row 48/69'
  last_case_seq  int NOT NULL DEFAULT 0,       -- số thứ tự checklist gần nhất (function)
  rank           text NOT NULL,
  deleted_at     timestamptz,
  UNIQUE (project_id, code)
);

CREATE TABLE requirement_links (               -- epic <-> function, nhiều-nhiều
  epic_id      bigint REFERENCES requirements(id) ON DELETE CASCADE,
  function_id  bigint REFERENCES requirements(id) ON DELETE CASCADE,
  PRIMARY KEY (epic_id, function_id)
);

CREATE TABLE requirement_sources (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requirement_id  bigint NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  path            text NOT NULL,               -- đường dẫn hoặc URL tài liệu BA
  position        int NOT NULL DEFAULT 0
);

CREATE TABLE test_categories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,                   -- UI/UX | Functional | Validation | Business Rule | Authorization | Integration
  position    int NOT NULL DEFAULT 0,
  UNIQUE (project_id, name)
);

CREATE TABLE test_cases (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id     bigint NOT NULL REFERENCES projects(id),
  function_id    bigint NOT NULL REFERENCES requirements(id),
  seq            int NOT NULL,                 -- 20
  code           text NOT NULL,                -- 'CL_NDS-U-00796-020'
  title          text NOT NULL,                -- Checklist Item
  priority       text NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  category_id    bigint REFERENCES test_categories(id),
  preconditions  text,
  steps          jsonb NOT NULL DEFAULT '[]',  -- [{id, no, action, expected}]
  status         text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','passed','failed','blocked','na')),
  notes          text,
  automation_tag text,                         -- tag bên repo Playwright, ví dụ '@CL_NDS-U-00796-020'
  version        int NOT NULL DEFAULT 1,
  rank           text NOT NULL,
  search_text    tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', code || ' ' || title || ' ' || coalesce(preconditions,'') || ' ' ||
      jsonb_path_query_array(steps, '$[*].action')::text || ' ' ||
      jsonb_path_query_array(steps, '$[*].expected')::text)
  ) STORED,
  created_by     bigint REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     bigint REFERENCES users(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  UNIQUE (project_id, code),
  UNIQUE (function_id, seq)
);

CREATE TABLE test_case_bugs (                  -- cột Link Bug
  test_case_id  bigint NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  issue_id      bigint NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  PRIMARY KEY (test_case_id, issue_id)
);

CREATE TABLE test_case_versions (
  test_case_id  bigint REFERENCES test_cases(id) ON DELETE CASCADE,
  version       int NOT NULL,
  snapshot      jsonb NOT NULL,
  changed_by    bigint REFERENCES users(id),
  changed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (test_case_id, version)
);

CREATE INDEX ON requirements (project_id, kind, rank) WHERE deleted_at IS NULL;
CREATE INDEX ON requirement_links (function_id);
CREATE INDEX ON test_cases (function_id, rank) WHERE deleted_at IS NULL;
CREATE INDEX ON test_cases (project_id, status, category_id, priority) WHERE deleted_at IS NULL;
CREATE INDEX ON test_cases (project_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ON test_cases USING gin (search_text);
CREATE INDEX ON test_cases USING gin (title gin_trgm_ops);
CREATE INDEX ON test_cases USING gin (code gin_trgm_ops);
CREATE INDEX ON test_case_bugs (issue_id);
