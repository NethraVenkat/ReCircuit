import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  hideReviewFee: false,
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
    // Read errors are fatal: an outage must never be interpreted as absence.
    const existing = await this.getBookingByClientRequestId(bookingData.recyclerId, bookingData.clientRequestId);
    if (existing) return { booking: existing, isDuplicate: true };
    const omitReference = await this.consumeFailureSwitch(bookingData.recyclerId, "omitNextReference");
    const { data, error } = await this.client.rpc("create_booking", { p_booking: {
      recycler_id: bookingData.recyclerId,
      booking_reference: generateReference(RECYCLER_CONFIGS[bookingData.recyclerId].refPrefix),
      client_request_id: bookingData.clientRequestId, full_name: bookingData.fullName,
      phone: bookingData.phone, address_line: bookingData.addressLine,
      locality: bookingData.locality, pincode: bookingData.pincode,
      preferred_slot: bookingData.preferredSlot, items: bookingData.items,
      charged_fee_inr: bookingData.chargedFeeInr ?? null,
      data_wipe_acknowledged: bookingData.dataWipeAcknowledged ?? null,
    } });
    this.check(error);
    if (!data?.booking) throw new Error("PERSISTENCE_UNAVAILABLE: BOOKING_RESPONSE");
    return { booking: this.mapRowToBooking(data.booking), isDuplicate: data.isDuplicate, omitReference };
  }

  async getBookingByReference(recyclerId: RecyclerId, reference: string): Promise<PortalBooking | null> {
    const { data, error } = await this.client
      .from("bookings")
      .select("*, events:booking_events(*)")
      .eq("recycler_id", recyclerId)
      .ilike("booking_reference", reference.trim())
      .maybeSingle();

    this.check(error);
    if (!data) return null;
    return this.mapRowToBooking(data);
  }

  async getBookingByClientRequestId(recyclerId: RecyclerId, clientRequestId: string): Promise<PortalBooking | null> {
    const { data, error } = await this.client
      .from("bookings")
      .select("*, events:booking_events(*)")
      .eq("recycler_id", recyclerId)
      .eq("client_request_id", clientRequestId.trim())
      .maybeSingle();

    this.check(error);
    if (!data) return null;
    return this.mapRowToBooking(data);
  }

  async listBookings(recyclerId: RecyclerId): Promise<PortalBooking[]> {
    const { data, error } = await this.client
      .from("bookings")
      .select("*, events:booking_events(*)")
      .eq("recycler_id", recyclerId)
      .order("created_at", { ascending: false });

    this.check(error);
    return (data || []).map((row) => this.mapRowToBooking(row));
  }

  async updateBookingStatus(
    recyclerId: RecyclerId,
    reference: string,
    status: PortalBookingStatus,
    detail: string,
    options: { pickupOtp?: string; weightKg?: number; slot?: string; isSimulated?: boolean } = {}
  ): Promise<PortalBooking | null> {
    const { error } = await this.client.rpc("update_booking", {
      p_recycler: recyclerId, p_reference: reference, p_status: status,
      p_detail: detail, p_options: options,
    });
    this.check(error);
    return this.getBookingByReference(recyclerId, reference);
  }

  async getFailureSwitches(recyclerId: RecyclerId): Promise<FailureSwitches> {
    const { data, error } = await this.client
      .from("failure_switches")
      .select("*")
      .eq("recycler_id", recyclerId)
      .maybeSingle();

    this.check(error);
    if (!data) return { ...DEFAULT_SWITCHES };
    return {
      failNextSubmit: data.fail_next_submit ?? false,
      omitNextReference: data.omit_next_reference ?? false,
      changedPolicyLayout: data.changed_policy_layout ?? false,
      hideFeeInfo: data.hide_fee_info ?? false,
      raiseFee: data.raise_fee ?? false,
      hideReviewFee: data.hide_review_fee ?? false,
    };
  }

  async updateFailureSwitches(recyclerId: RecyclerId, switches: Partial<FailureSwitches>): Promise<FailureSwitches> {
    const { data, error } = await this.client.rpc("update_switches", { p_recycler: recyclerId, p_switches: switches });
    this.check(error);
    return data as FailureSwitches;
  }

  async consumeFailureSwitch(recyclerId: RecyclerId, switchName: keyof FailureSwitches): Promise<boolean> {
    const { data, error } = await this.client.rpc("consume_switch", { p_recycler: recyclerId, p_switch: switchName });
    this.check(error);
    return Boolean(data);
  }

  async reset(recyclerId?: RecyclerId): Promise<void> {
    if (process.env.NODE_ENV === "production") throw new Error("RESET_DISABLED_IN_PRODUCTION");
    for (const table of ["bookings", "failure_switches"]) {
      let query = this.client.from(table).delete();
      query = recyclerId ? query.eq("recycler_id", recyclerId) : query.neq("recycler_id", "");
      const { error } = await query;
      this.check(error);
    }
  }

  private check(error: { code?: string } | null): void {
    if (error) throw new Error(`PERSISTENCE_UNAVAILABLE: ${error.code || "PORTAL_DATABASE"}`);
  }

  async consumeNonce(nonce: string, expiresAt: number): Promise<boolean> {
    const { data, error } = await this.client.rpc("consume_nonce", { p_nonce: nonce, p_expires_at: new Date(expiresAt).toISOString() });
    this.check(error);
    return Boolean(data);
  }
  async isNonceUsed(nonce: string): Promise<boolean> {
    const { data, error } = await this.client.from("captcha_nonces").select("nonce").eq("nonce", nonce).maybeSingle();
    this.check(error);
    return Boolean(data);
  }
  async recordUsedNonce(nonce: string, expiresAt: number): Promise<void> {
    if (!await this.consumeNonce(nonce, expiresAt)) throw new Error("CAPTCHA_NONCE_ALREADY_USED");
  }

  private mapRowToBooking(row: Record<string, unknown>): PortalBooking {
    const rawEvents = (row.events as Record<string, unknown>[]) || [];
    const events = rawEvents.map((e) => ({
      id: String(e.id),
      eventType: String(e.event_type || e.eventType),
      status: (e.status as PortalBookingStatus) || "RECEIVED",
      detail: typeof e.detail === "string" ? e.detail : "",
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
      ...(typeof row.charged_fee_inr === "number" ? { chargedFeeInr: row.charged_fee_inr } : {}),
      items: (row.items as PortalBooking["items"]) || [],
      status: row.status as PortalBookingStatus,
      ...(typeof row.data_wipe_acknowledged === "boolean" ? { dataWipeAcknowledged: row.data_wipe_acknowledged } : {}),
      pickupOtp: typeof row.pickup_otp === "string" ? row.pickup_otp : undefined,
      weightKg: row.weight_kg != null ? Number(row.weight_kg) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      events,
    };
  }
}

