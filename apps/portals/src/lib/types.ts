export type RecyclerId = "deccan" | "paperplus" | "quickscrap";

export type PortalBookingStatus =
  | "RECEIVED"
  | "CONFIRMED"
  | "SCHEDULED"
  | "PICKED_UP"
  | "WEIGHED"
  | "CANCELLED";

export interface BookingItemInput {
  name: string;
  category?: string;
  quantity?: number;
  weightKg?: number;
}

export interface BookingEvent {
  id: string;
  eventType: string;
  status: PortalBookingStatus;
  detail: string;
  isSimulated: boolean;
  createdAt: string;
}

export interface PortalBooking {
  id: string;
  recyclerId: RecyclerId;
  bookingReference: string;
  clientRequestId: string;
  fullName: string;
  phone: string;
  addressLine: string;
  locality: string;
  pincode: string;
  preferredSlot: string;
  items: BookingItemInput[];
  chargedFeeInr?: number;
  status: PortalBookingStatus;
  pickupOtp?: string;
  weightKg?: number;
  dataWipeAcknowledged?: boolean;
  createdAt: string;
  updatedAt: string;
  events: BookingEvent[];
}

export interface FailureSwitches {
  failNextSubmit: boolean;
  omitNextReference: boolean;
  changedPolicyLayout: boolean;
  hideFeeInfo: boolean;
  raiseFee?: boolean;
  hideReviewFee?: boolean;
}

export const SERVICEABLE_PINCODES = [
  "500072", // Kukatpally
  "500085", // KPHB
  "500018", // Bharat Nagar / Sanath Nagar
  "500032", // HITEC City / Gachibowli
  "500081", // Madhapur
] as const;

export interface BookingRepository {
  createBooking(
    booking: Omit<PortalBooking, "id" | "createdAt" | "updatedAt" | "events" | "status" | "bookingReference">
  ): Promise<{ booking: PortalBooking; isDuplicate: boolean; omitReference?: boolean }>;
  getBookingByReference(recyclerId: RecyclerId, reference: string): Promise<PortalBooking | null>;
  getBookingByClientRequestId(recyclerId: RecyclerId, clientRequestId: string): Promise<PortalBooking | null>;
  listBookings(recyclerId: RecyclerId): Promise<PortalBooking[]>;
  updateBookingStatus(
    recyclerId: RecyclerId,
    reference: string,
    status: PortalBookingStatus,
    detail: string,
    options?: { pickupOtp?: string; weightKg?: number; slot?: string; isSimulated?: boolean }
  ): Promise<PortalBooking | null>;
  getFailureSwitches(recyclerId: RecyclerId): Promise<FailureSwitches>;
  updateFailureSwitches(recyclerId: RecyclerId, switches: Partial<FailureSwitches>): Promise<FailureSwitches>;
  consumeFailureSwitch(recyclerId: RecyclerId, switchName: keyof FailureSwitches): Promise<boolean>;
  isNonceUsed(nonce: string): Promise<boolean>;
  recordUsedNonce(nonce: string, expiresAt: number): Promise<void>;
  reset(recyclerId?: RecyclerId): Promise<void>;
}

