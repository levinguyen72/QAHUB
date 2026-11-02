import type { AttachmentKind, ResultStatus } from './enums';

export interface IngestAttachmentInput {
  ref: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface IngestResultInput {
  testId: string;
  file: string;
  line?: number;
  titlePath: string[];
  browser?: string;
  status: ResultStatus;
  retries?: number;
  durationMs?: number;
  error?: { message?: string; stack?: string; snippet?: string };
  tags?: string[];
  attachments?: IngestAttachmentInput[];
}

export interface IngestRunInput {
  externalId: string;
  name?: string;
  branch?: string;
  commitSha?: string;
  environment?: string;
  ciUrl?: string;
  startedAt?: string;
  finishedAt?: string;
  results: IngestResultInput[];
}

export interface IngestRunResponse {
  runId: number;
  status: string;
  uploads: { ref: string; attachmentId: string; uploadUrl: string }[];
}
