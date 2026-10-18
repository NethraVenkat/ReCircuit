import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  BookingRepository,
  FailureSwitches,
  PortalBooking,
  PortalBookingStatus,
  RecyclerId,
} from "../types";
import { RECYCLER_CONFIGS, generateReference } from "../config";

interface StoreData {
  bookings: PortalBooking[];
  switches: FailureSwitches;
}

const DEFAULT_SWITCHES: FailureSwitches = {
  failNextSubmit: false,
  omitNextReference: false,
  changedPolicyLayout: false,
  hideFeeInfo: false,
  raiseFee: false,
};

export class FileRepository implements BookingRepository {
  private baseDir: string;
  private lockPromise: Promise<void> = Promise.resolve();

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), ".data");
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const prev = this.lockPromise;
    let release!: (value: void) => void;
    this.lockPromise = new Promise((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private getFilePath(recyclerId: RecyclerId): string {
    return path.join(this.baseDir, `${recyclerId}.json`);
  }

  private getNoncesPath(): string {
    return path.join(this.baseDir, "used_nonces.json");
  }

  private readStore(recyclerId: RecyclerId): StoreData {
    const filePath = this.getFilePath(recyclerId);
    if (!fs.existsSync(filePath)) {
      return { bookings: [], switches: { ...DEFAULT_SWITCHES } };
    }
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content) as StoreData;
      return {
        bookings: parsed.bookings || [],
        switches: { ...DEFAULT_SWITCHES, ...(parsed.switches || {}) },
      };
    } catch {
      return { bookings: [], switches: { ...DEFAULT_SWITCHES } };
    }
  }

  private writeStore(recyclerId: RecyclerId, data: StoreData): void {
    const filePath = this.getFilePath(recyclerId);
    const tmpPath = `${filePath}.${randomUUID()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    this.safeRename(tmpPath, filePath);
  }

  private readNonces(): Record<string, number> {
    const p = this.getNoncesPath();
    if (!fs.existsSync(p)) return {};
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
      return {};
    }
  }

  private writeNonces(nonces: Record<string, number>): void {
    const p = this.getNoncesPath();
    const tmp = `${p}.${randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(nonces, null, 2), "utf-8");
    this.safeRename(tmp, p);
  }

  private safeRename(src: string, dest: string): void {
    for (let i = 0; i < 5; i++) {
      try {
        fs.renameSync(src, dest);
        return;
      } catch (err: unknown) {
        const isLockError =
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          ((err as { code: string }).code === "EPERM" || (err as { code: string }).code === "EBUSY");
        if (isLockError && i < 4) {
          const start = Date.now();
          while (Date.now() - start < 10) {
            // Wait 10ms for Windows file release
          }
          continue;
        }
        try {
          fs.copyFileSync(src, dest);
          fs.unlinkSync(src);
          return;
        } catch {
          throw err;
        }
      }
    }
  }

  async isNonceUsed(nonce: string): Promise<boolean> {
    return this.withLock(() => {
      const nonces = this.readNonces();
      const exp = nonces[nonce];
      if (!exp) return false;
      if (Date.now() > exp) {
        delete nonces[nonce];
        this.writeNonces(nonces);
        return false;
      }
      return true;
    });
  }

  async recordUsedNonce(nonce: string, expiresAt: number): Promise<void> {
    return this.withLock(() => {
      const nonces = this.readNonces();
      const now = Date.now();
      for (const [k, exp] of Object.entries(nonces)) {
        if (now > exp) delete nonces[k];
      }
      nonces[nonce] = expiresAt;
      this.writeNonces(nonces);
    });
  }

  async createBooking(
    bookingData: Omit<PortalBooking, "id" | "createdAt" | "updatedAt" | "events" | "status" | "bookingReference">
  ): Promise<{ booking: PortalBooking; isDuplicate: boolean; omitReference?: boolean }> {
    return this.withLock(() => {
      const store = this.readStore(bookingData.recyclerId);

      // 1. Check duplicate client_request_id
      const existing = store.bookings.find((b) => b.clientRequestId === bookingData.clientRequestId);
      if (existing) {
        return { booking: existing, isDuplicate: true };
      }

      // 2. Check failure switches
      const omitRef = store.switches.omitNextReference;
      if (omitRef) {
        store.switches.omitNextReference = false; // one-shot
      }

      const now = new Date().toISOString();
      const config = RECYCLER_CONFIGS[bookingData.recyclerId];

      // 3. Guarantee unique reference via storage query
      let reference = "";
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = generateReference(config.refPrefix);
        if (!store.bookings.some((b) => b.bookingReference === candidate)) {
          reference = candidate;
          break;
        }
      }
      if (!reference) {
        reference = `${config.refPrefix}-${Date.now().toString().slice(-5)}`;
      }

      const newBooking: PortalBooking = {
        ...bookingData,
        id: randomUUID(),
        bookingReference: reference,
        status: "RECEIVED",
        createdAt: now,
        updatedAt: now,
        events: [
          {
            id: randomUUID(),
            eventType: "BOOKING_CREATED",
            status: "RECEIVED",
            detail: "Booking request received through public website portal",
            isSimulated: false,
            createdAt: now,
          },
        ],
      };

      store.bookings.unshift(newBooking);
      this.writeStore(bookingData.recyclerId, store);

      return { booking: newBooking, isDuplicate: false, omitReference: omitRef };
    });
  }

  async getBookingByReference(recyclerId: RecyclerId, reference: string): Promise<PortalBooking | null> {
    return this.withLock(() => {
      const store = this.readStore(recyclerId);
      const cleanRef = reference.trim().toUpperCase();
      return store.bookings.find((b) => b.bookingReference.toUpperCase() === cleanRef) || null;
    });
  }

  async getBookingByClientRequestId(recyclerId: RecyclerId, clientRequestId: string): Promise<PortalBooking | null> {
    return this.withLock(() => {
      const store = this.readStore(recyclerId);
      const cleanClient = clientRequestId.trim();
      return store.bookings.find((b) => b.clientRequestId === cleanClient) || null;
    });
  }

  async listBookings(recyclerId: RecyclerId): Promise<PortalBooking[]> {
    return this.withLock(() => {
      const store = this.readStore(recyclerId);
      return store.bookings;
    });
  }

  async updateBookingStatus(
    recyclerId: RecyclerId,
    reference: string,
    status: PortalBookingStatus,
    detail: string,
    options: { pickupOtp?: string; weightKg?: number; slot?: string; isSimulated?: boolean } = {}
  ): Promise<PortalBooking | null> {
    return this.withLock(() => {
      const store = this.readStore(recyclerId);
      const booking = store.bookings.find((b) => b.bookingReference.toUpperCase() === reference.trim().toUpperCase());
      if (!booking) return null;

      const now = new Date().toISOString();
      booking.status = status;
      booking.updatedAt = now;

      if (options.pickupOtp) booking.pickupOtp = options.pickupOtp;
      if (options.weightKg !== undefined) booking.weightKg = options.weightKg;
      if (options.slot) booking.preferredSlot = options.slot;

      booking.events.push({
        id: randomUUID(),
        eventType: `STATUS_UPDATED_${status}`,
        status,
        detail,
        isSimulated: options.isSimulated ?? true,
        createdAt: now,
      });

      this.writeStore(recyclerId, store);
      return booking;
    });
  }

  async getFailureSwitches(recyclerId: RecyclerId): Promise<FailureSwitches> {
    return this.withLock(() => {
      const store = this.readStore(recyclerId);
      return store.switches;
    });
  }

  async updateFailureSwitches(recyclerId: RecyclerId, switches: Partial<FailureSwitches>): Promise<FailureSwitches> {
    return this.withLock(() => {
      const store = this.readStore(recyclerId);
      store.switches = { ...store.switches, ...switches };
      this.writeStore(recyclerId, store);
      return store.switches;
    });
  }

  async consumeFailureSwitch(recyclerId: RecyclerId, switchName: keyof FailureSwitches): Promise<boolean> {
    return this.withLock(() => {
      const store = this.readStore(recyclerId);
      const val = store.switches[switchName];
      if (val) {
        store.switches[switchName] = false;
        this.writeStore(recyclerId, store);
        return true;
      }
      return false;
    });
  }

  async reset(recyclerId?: RecyclerId): Promise<void> {
    return this.withLock(() => {
      const recyclers: RecyclerId[] = recyclerId ? [recyclerId] : ["deccan", "paperplus", "quickscrap"];
      for (const r of recyclers) {
        this.writeStore(r, { bookings: [], switches: { ...DEFAULT_SWITCHES } });
      }
      const np = this.getNoncesPath();
      if (fs.existsSync(np)) {
        try {
          fs.unlinkSync(np);
        } catch {
          // ignore unlink failure if already removed
        }
      }
    });
  }
}

