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
};

export class FileRepository implements BookingRepository {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), ".data");
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getFilePath(recyclerId: RecyclerId): string {
    return path.join(this.baseDir, `${recyclerId}.json`);
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
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async createBooking(
    bookingData: Omit<PortalBooking, "id" | "createdAt" | "updatedAt" | "events" | "status" | "bookingReference">
  ): Promise<{ booking: PortalBooking; isDuplicate: boolean; omitReference?: boolean }> {
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
    const reference = generateReference(config.refPrefix);

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
  }

  async getBookingByReference(recyclerId: RecyclerId, reference: string): Promise<PortalBooking | null> {
    const store = this.readStore(recyclerId);
    const cleanRef = reference.trim().toUpperCase();
    return store.bookings.find((b) => b.bookingReference.toUpperCase() === cleanRef) || null;
  }

  async listBookings(recyclerId: RecyclerId): Promise<PortalBooking[]> {
    const store = this.readStore(recyclerId);
    return store.bookings;
  }

  async updateBookingStatus(
    recyclerId: RecyclerId,
    reference: string,
    status: PortalBookingStatus,
    detail: string,
    options: { pickupOtp?: string; weightKg?: number; slot?: string; isSimulated?: boolean } = {}
  ): Promise<PortalBooking | null> {
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
  }

  async getFailureSwitches(recyclerId: RecyclerId): Promise<FailureSwitches> {
    const store = this.readStore(recyclerId);
    return store.switches;
  }

  async updateFailureSwitches(recyclerId: RecyclerId, switches: Partial<FailureSwitches>): Promise<FailureSwitches> {
    const store = this.readStore(recyclerId);
    store.switches = { ...store.switches, ...switches };
    this.writeStore(recyclerId, store);
    return store.switches;
  }

  async consumeFailureSwitch(recyclerId: RecyclerId, switchName: keyof FailureSwitches): Promise<boolean> {
    const store = this.readStore(recyclerId);
    const val = store.switches[switchName];
    if (val) {
      store.switches[switchName] = false;
      this.writeStore(recyclerId, store);
      return true;
    }
    return false;
  }

  async reset(recyclerId?: RecyclerId): Promise<void> {
    const recyclers: RecyclerId[] = recyclerId ? [recyclerId] : ["deccan", "paperplus", "quickscrap"];
    for (const r of recyclers) {
      this.writeStore(r, { bookings: [], switches: { ...DEFAULT_SWITCHES } });
    }
  }
}

