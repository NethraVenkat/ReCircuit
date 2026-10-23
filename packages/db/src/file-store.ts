import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { IRepository, RequestRecord, JobRecord } from "./types.js";
import type { StatusEvent, Request, Item, Plan, UserApprovalEvidence, UserDecisionEvidence } from "@recircuit/core";

interface SerializedRequestRecord {
  household?: Record<string, unknown>;
  request: Request;
  items?: Item[];
  plan?: Plan | null;
  approval?: UserApprovalEvidence | UserDecisionEvidence | null;
  auditEvents?: StatusEvent[];
  updatedAt?: string;
  intakeResult?: { items?: Item[] };
}

export class FileRepository implements IRepository {
  private baseDir: string;
  private requestsDir: string;
  private jobsDir: string;
  private verificationsDir: string;
  private actionLogPath: string;

  constructor(baseDir = ".data") {
    if (process.env.NODE_ENV === "production") throw new Error("PERSISTENCE_UNAVAILABLE: FILE_REPOSITORY_DISABLED");
    this.baseDir = path.resolve(process.cwd(), baseDir);
    this.requestsDir = path.join(this.baseDir, "requests");
    this.jobsDir = path.join(this.baseDir, "jobs");
    this.verificationsDir = path.join(this.baseDir, "verifications");
    this.actionLogPath = path.join(this.baseDir, "action-log.jsonl");

    this.ensureDirsSync();
  }

  private ensureDirsSync(): void {
    if (!fs.existsSync(this.requestsDir)) {
      fs.mkdirSync(this.requestsDir, { recursive: true });
    }
    if (!fs.existsSync(this.jobsDir)) {
      fs.mkdirSync(this.jobsDir, { recursive: true });
    }
    if (!fs.existsSync(this.verificationsDir)) {
      fs.mkdirSync(this.verificationsDir, { recursive: true });
    }
  }

  public async saveRequest(record: RequestRecord): Promise<void> {
    this.ensureDirsSync();
    const filePath = path.join(this.requestsDir, `${record.request.id}.json`);
    let existingData: Record<string, unknown> = {};
    if (fs.existsSync(filePath)) {
      try {
        const content = await fs.promises.readFile(filePath, "utf-8");
        existingData = JSON.parse(content) as Record<string, unknown>;
      } catch {
        // ignore parse errors and overwrite
      }
    }

    const payload = {
      ...existingData,
      request: record.request,
      ...(record.household ? { household: record.household } : {}),
      items: record.items,
      ...(record.plan !== undefined ? { plan: record.plan } : {}),
      ...(record.approval !== undefined ? { approval: record.approval } : {}),
      auditEvents: record.auditEvents,
      updatedAt: record.updatedAt || new Date().toISOString(),
    };

    await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
  }

  public async getRequest(requestId: string): Promise<RequestRecord | null> {
    const filePath = path.join(this.requestsDir, `${requestId}.json`);
    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = await fs.promises.readFile(filePath, "utf-8");
      const data = JSON.parse(raw) as SerializedRequestRecord;
      const items = data.items || data.intakeResult?.items || [];
      return {
        ...(data.household ? { household: data.household } : {}),
        request: {
          ...data.request,
          items,
        },
        items,
        plan: data.plan || null,
        approval: data.approval || null,
        auditEvents: data.auditEvents || [],
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  public async listRequests(): Promise<RequestRecord[]> {
    this.ensureDirsSync();
    const files = (await fs.promises.readdir(this.requestsDir)).filter((f) => f.endsWith(".json"));
    const records: RequestRecord[] = [];

    for (const f of files) {
      const reqId = f.replace(/\.json$/, "");
      const rec = await this.getRequest(reqId);
      if (rec) records.push(rec);
    }

    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public async enqueueJob(type: string, payload: Record<string, unknown>): Promise<JobRecord> {
    this.ensureDirsSync();
    const id = randomUUID();
    const job: JobRecord = {
      id,
      type,
      payload,
      status: "pending",
      attempts: 0,
      lockedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
    };

    const filePath = path.join(this.jobsDir, `${id}.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(job, null, 2), "utf-8");
    return job;
  }

  public async dequeueJob(type?: string): Promise<JobRecord | null> {
    this.ensureDirsSync();
    const files = await fs.promises.readdir(this.jobsDir);

    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const filePath = path.join(this.jobsDir, f);
      try {
        const raw = await fs.promises.readFile(filePath, "utf-8");
        const job = JSON.parse(raw) as JobRecord;
        if (job.status === "pending" && (!type || job.type === type)) {
          job.status = "running";
          job.lockedAt = new Date().toISOString();
          job.attempts += 1;
          job.updatedAt = new Date().toISOString();
          await fs.promises.writeFile(filePath, JSON.stringify(job, null, 2), "utf-8");
          return job;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  public async completeJob(jobId: string, result?: Record<string, unknown>): Promise<void> {
    const filePath = path.join(this.jobsDir, `${jobId}.json`);
    if (!fs.existsSync(filePath)) return;

    try {
      const raw = await fs.promises.readFile(filePath, "utf-8");
      const job = JSON.parse(raw) as JobRecord;
      job.status = "done";
      job.lockedAt = null;
      job.updatedAt = new Date().toISOString();
      if (result) {
        job.payload = { ...job.payload, result };
      }
      await fs.promises.writeFile(filePath, JSON.stringify(job, null, 2), "utf-8");
    } catch {
      // ignore
    }
  }

  public async failJob(jobId: string, error: string): Promise<void> {
    const filePath = path.join(this.jobsDir, `${jobId}.json`);
    if (!fs.existsSync(filePath)) return;

    try {
      const raw = await fs.promises.readFile(filePath, "utf-8");
      const job = JSON.parse(raw) as JobRecord;
      job.status = "failed";
      job.lockedAt = null;
      job.error = error;
      job.updatedAt = new Date().toISOString();
      await fs.promises.writeFile(filePath, JSON.stringify(job, null, 2), "utf-8");
    } catch {
      // ignore
    }
  }

  public async appendAudit(event: StatusEvent): Promise<void> {
    const line = JSON.stringify({ ...event, recordedAt: new Date().toISOString() }) + "\n";
    await fs.promises.appendFile(this.actionLogPath, line, "utf-8");
  }

  public async getAudits(filter?: { requestId?: string; legId?: string }): Promise<StatusEvent[]> {
    if (!fs.existsSync(this.actionLogPath)) return [];

    const raw = await fs.promises.readFile(this.actionLogPath, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    const events: StatusEvent[] = [];

    for (const line of lines) {
      try {
        const ev = JSON.parse(line) as StatusEvent;
        // The shared append-only log also contains safe-action attempts and verifier
        // metadata. Only state-transition events belong in a household timeline.
        if (typeof ev.newState !== "string" || typeof ev.previousState !== "string" || typeof ev.observedAt !== "string") continue;
        if (filter?.requestId && ev.requestId !== filter.requestId) continue;
        if (filter?.legId && ev.legId !== filter.legId) continue;
        events.push(ev);
      } catch {
        continue;
      }
    }

    return events;
  }
}
