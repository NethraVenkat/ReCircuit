import type { Request, Item, Plan, StatusEvent, UserApprovalEvidence, UserDecisionEvidence } from "@recircuit/core";

export interface RequestRecord {
  revision?: number;
  household?: Record<string, unknown>;
  request: Request;
  items: Item[];
  plan?: Plan | null;
  approval?: UserApprovalEvidence | UserDecisionEvidence | null;
  auditEvents: StatusEvent[];
  updatedAt: string;
}

export type JobStatus = "pending" | "running" | "done" | "failed";

export interface JobRecord {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  lockedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  error?: string | null;
}

export interface IRepository {
  withRequestLock?<T>(requestId: string, run: () => Promise<T>): Promise<T>;
  appendAction?(record: Record<string, unknown>, idempotencyKey?: string): Promise<void>;
  getActionRecords?(requestId: string): Promise<Array<Record<string, unknown>>>;
  saveRequest(record: RequestRecord): Promise<void>;
  getRequest(requestId: string, ownerId?: string): Promise<RequestRecord | null>;
  listRequests(ownerId?: string): Promise<RequestRecord[]>;
  enqueueJob(type: string, payload: Record<string, unknown>): Promise<JobRecord>;
  dequeueJob(type?: string): Promise<JobRecord | null>;
  completeJob(jobId: string, result?: Record<string, unknown>): Promise<void>;
  failJob(jobId: string, error: string): Promise<void>;
  appendAudit(event: StatusEvent): Promise<void>;
  getAudits(filter?: { requestId?: string; legId?: string }): Promise<StatusEvent[]>;
}
