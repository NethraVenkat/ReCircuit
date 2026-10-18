import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import type {
  BookingRepository,
  FailureSwitches,
  PortalBooking,
  PortalBookingStatus,
  RecyclerId,
} from "../types";
import { RECYCLER_CONFIGS, generateReference } from "../config";

const DEFAULT_SWITCHES: FailureSwitches = {
  failNextSubmit: false,
  omitNextReference: false,
  changedPolicyLayout: false,
  hideFeeInfo: false,
  raiseFee: false,
};

export class SupabaseRepository implements BookingRepository {
  private client: SupabaseClient<any, any, any>;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.client = createClient(supabaseUrl, supabaseKey, {
      db: { schema: "portal" },
    });
  }

  async createBooking(
    bookingData: Omit<PortalBooking, "id" | "createdAt" | "updatedAt" | "events" | "status" | "bookingReference">
  ): Promise<{ booking: PortalBooking; isDuplicate: boolean; omitReference?: boolean }> {
    // 1. Check duplicate client_request_id
    const { data: existing } = await this.client
      .from("bookings")
      .select("*, events:booking_events(*)")
      .eq("recycler_id", bookingData.recyclerId)
      .eq("client_request_id", bookingData.clientRequestId)
      .maybeSingle();

    if (existing) {
      return { booking: this.mapRowToBooking(existing), isDuplicate: true };
    }

    // 2. Failure switches
    const switches = await this.getFailureSwitches(bookingData.recyclerId);
    let omitRef = switches.omitNextReference;
    if (omitRef) {
      await this.consumeFailureSwitch(bookingData.recyclerId, "omitNextReference");
    }

    const config = RECYCLER_CONFIGS[bookingData.recyclerId];
    const reference = generateReference(config.refPrefix);
    const now = new Date().toISOString();

    const { data: newRow, error } = await this.client
      .from("bookings")
      .insert({
        recycler_id: bookingData.recyclerId,
        booking_reference: reference,
        client_request_id: bookingData.clientRequestId,
        full_name: bookingData.fullName,
        phone: bookingData.phone,
        address_line: bookingData.addressLine,
        locality: bookingData.locality,
        pincode: bookingData.pincode,
        preferred_slot: bookingData.preferredSlot,
        items: bookingData.items,
        status: "RECEIVED",
      })
      .select()
      .single();

    if (error || !newRow) {
      throw new Error(`Failed to create portal booking in Supabase: ${error?.message}`);
    }

    // Insert creation event
    await this.client.from("booking_events").insert({
      booking_id: newRow.id,
      event_type: "BOOKING_CREATED",
      status: "RECEIVED",
      detail: "Booking request received through public website portal",
      is_simulated: false,
      created_at: now,
    });

    const booking = this.mapRowToBooking({
      ...newRow,
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
    });

    return { booking, isDuplicate: false, omitReference: omitRef };
  }

  async getBookingByReference(recyclerId: RecyclerId, reference: string): Promise<PortalBooking | null> {
    const { data } = await this.client
      .from("bookings")
      .select("*, events:booking_events(*)")
      .eq("recycler_id", recyclerId)
      .ilike("booking_reference", reference.trim())
      .maybeSingle();

    if (!data) return null;
    return this.mapRowToBooking(data);
  }

  async getBookingByClientRequestId(recyclerId: RecyclerId, clientRequestId: string): Promise<PortalBooking | null> {
    const { data } = await this.client
      .from("bookings")
      .select("*, events:booking_events(*)")
      .eq("recycler_id", recyclerId)
      .eq("client_request_id", clientRequestId.trim())
      .maybeSingle();

    if (!data) return null;
    return this.mapRowToBooking(data);
  }

  async listBookings(recyclerId: RecyclerId): Promise<PortalBooking[]> {
    const { data } = await this.client
      .from("bookings")
      .select("*, events:booking_events(*)")
      .eq("recycler_id", recyclerId)
      .order("created_at", { ascending: false });

    return (data || []).map((row) => this.mapRowToBooking(row));
  }

  async updateBookingStatus(
    recyclerId: RecyclerId,
    reference: string,
    status: PortalBookingStatus,
    detail: string,
    options: { pickupOtp?: string; weightKg?: number; slot?: string; isSimulated?: boolean } = {}
  ): Promise<PortalBooking | null> {
    const existing = await this.getBookingByReference(recyclerId, reference);
    if (!existing) return null;

    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (options.pickupOtp) updates.pickup_otp = options.pickupOtp;
    if (options.weightKg !== undefined) updates.weight_kg = options.weightKg;
    if (options.slot) updates.preferred_slot = options.slot;

    const { data: updated, error } = await this.client
      .from("bookings")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .single();

    if (error || !updated) return null;

    await this.client.from("booking_events").insert({
      booking_id: existing.id,
      event_type: `STATUS_UPDATED_${status}`,
      status,
      detail,
      is_simulated: options.isSimulated ?? true,
    });

    return this.getBookingByReference(recyclerId, reference);
  }

  async getFailureSwitches(recyclerId: RecyclerId): Promise<FailureSwitches> {
    const { data } = await this.client
      .from("failure_switches")
      .select("*")
      .eq("recycler_id", recyclerId)
      .maybeSingle();

    if (!data) return { ...DEFAULT_SWITCHES };
    return {
      failNextSubmit: data.fail_next_submit ?? false,
      omitNextReference: data.omit_next_reference ?? false,
      changedPolicyLayout: data.changed_policy_layout ?? false,
      hideFeeInfo: data.hide_fee_info ?? false,
    };
  }

  async updateFailureSwitches(recyclerId: RecyclerId, switches: Partial<FailureSwitches>): Promise<FailureSwitches> {
    const current = await this.getFailureSwitches(recyclerId);
    const updated = { ...current, ...switches };

    await this.client.from("failure_switches").upsert({
      recycler_id: recyclerId,
      fail_next_submit: updated.failNextSubmit,
      omit_next_reference: updated.omitNextReference,
      changed_policy_layout: updated.changedPolicyLayout,
      updated_at: new Date().toISOString(),
    });

    return updated;
  }

  async consumeFailureSwitch(recyclerId: RecyclerId, switchName: keyof FailureSwitches): Promise<boolean> {
    const switches = await this.getFailureSwitches(recyclerId);
    if (switches[switchName]) {
      await this.updateFailureSwitches(recyclerId, { [switchName]: false });
      return true;
    }
    return false;
  }

  async reset(recyclerId?: RecyclerId): Promise<void> {
    if (recyclerId) {
      await this.client.from("bookings").delete().eq("recycler_id", recyclerId);
      await this.client.from("failure_switches").delete().eq("recycler_id", recyclerId);
    } else {
      await this.client.from("bookings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await this.client.from("failure_switches").delete().neq("recycler_id", "");
    }
  }

  private inMemoryNonces: Map<string, number> = new Map();

  async isNonceUsed(nonce: string): Promise<boolean> {
    const exp = this.inMemoryNonces.get(nonce);
    if (!exp) return false;
    if (Date.now() > exp) {
      this.inMemoryNonces.delete(nonce);
      return false;
    }
    return true;
  }

  async recordUsedNonce(nonce: string, expiresAt: number): Promise<void> {
    const now = Date.now();
    for (const [k, exp] of this.inMemoryNonces.entries()) {
      if (now > exp) this.inMemoryNonces.delete(k);
    }
    this.inMemoryNonces.set(nonce, expiresAt);
  }

  private mapRowToBooking(row: Record<string, unknown>): PortalBooking {
    const rawEvents = (row.events as Record<string, unknown>[]) || [];
    const events = rawEvents.map((e) => ({
      id: String(e.id),
      eventType: String(e.event_type || e.eventType),
      status: (e.status as PortalBookingStatus) || "RECEIVED",
      detail: String(e.detail || ""),
      isSimulated: Boolean(e.is_simulated ?? e.isSimulated),
      createdAt: String(e.created_at || e.createdAt),
    }));

    return {
      id: String(row.id),
      recyclerId: row.recycler_id as RecyclerId,
      bookingReference: String(row.booking_reference),
      clientRequestId: String(row.client_request_id),
      fullName: String(row.full_name),
      phone: String(row.phone),
      addressLine: String(row.address_line),
      locality: String(row.locality),
      pincode: String(row.pincode),
      preferredSlot: String(row.preferred_slot),
      items: (row.items as PortalBooking["items"]) || [],
      status: row.status as PortalBookingStatus,
      pickupOtp: row.pickup_otp ? String(row.pickup_otp) : undefined,
      weightKg: row.weight_kg ? Number(row.weight_kg) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      events,
    };
  }
}

