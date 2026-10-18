/**
 * apps/worker/src/booking/selectors.ts
 *
 * Portal routing configuration, DOM selectors, and reference regexes for Stage 7 Booker.
 */

export interface PortalRouteConfig {
  defaultPort: number;
  bookPath: string;
  confirmationPathPrefix: string;
  trackPath: string;
  refPrefix: string;
  refRegex: RegExp;
}

export const PORTAL_ROUTES: Record<string, PortalRouteConfig> = {
  deccan: {
    defaultPort: 3101,
    bookPath: "/book-pickup",
    confirmationPathPrefix: "/book-pickup/confirmation",
    trackPath: "/track",
    refPrefix: "DEC",
    refRegex: /^DEC-\d{5}$/,
  },
  paperplus: {
    defaultPort: 3102,
    bookPath: "/schedule",
    confirmationPathPrefix: "/schedule/done",
    trackPath: "/status",
    refPrefix: "PPK",
    refRegex: /^PPK-\d{5}$/,
  },
  quickscrap: {
    defaultPort: 3103,
    bookPath: "/pickup",
    confirmationPathPrefix: "/pickup/thanks",
    trackPath: "/track-order",
    refPrefix: "QSH",
    refRegex: /^QSH-\d{5}$/,
  },
};

export const GENERIC_REF_REGEX = /^[A-Z]{2,4}-\d{4,6}$/;

export const PORTAL_SELECTORS = {
  bookingForm: '[data-testid="booking-form"]',
  clientRequestId: '[data-testid="client-request-id"]',
  fullName: '[data-testid="input-fullname"]',
  phone: '[data-testid="input-phone"]',
  addressLine: '[data-testid="input-address"]',
  locality: '[data-testid="input-locality"]',
  pincode: '[data-testid="input-pincode"]',
  preferredSlot: '[data-testid="select-slot"]',
  itemName: '[data-testid="input-item-name"]',
  itemQty: '[data-testid="input-item-qty"]',
  itemWeight: '[data-testid="input-item-weight"]',
  addItem: '[data-testid="add-item"]',
  itemRow: '[data-testid="item-row"]',
  dataWipeAck: '[data-testid="data-wipe-ack"]',
  dataWipePanel: '[data-testid="data-wipe-panel"]',
  humanVerificationPanel: '[data-human-verification="required"]',
  captchaImage: '[data-testid="captcha-image"]',
  captchaInput: '[data-testid="input-captcha-code"]',
  submitBooking: '[data-testid="submit-booking"]',
  formErrorBanner: '[data-testid="form-error-banner"]',
  bookingReference: '[data-testid="booking-reference"]',
  bookingReferenceMissing: '[data-testid="booking-reference-missing"]',
  confirmationStatus: '[data-testid="confirmation-status"]',
  duplicateNotice: '[data-testid="duplicate-notice"]',
  inputReference: '[data-testid="input-reference"]',
  submitTrack: '[data-testid="submit-track"]',
  trackingResult: '[data-testid="tracking-result"]',
  trackingStatus: '[data-testid="tracking-status"]',
} as const;

function getEnvPortalUrl(recyclerId: string): string | undefined {
  if (recyclerId === "deccan") return process.env.PORTAL_DECCAN_URL;
  if (recyclerId === "paperplus") return process.env.PORTAL_PAPERPLUS_URL;
  if (recyclerId === "quickscrap") return process.env.PORTAL_QUICKSCRAP_URL;
  return undefined;
}

export function getPortalBaseUrl(recyclerId: string, customBaseUrl?: string): string {
  if (customBaseUrl) return customBaseUrl.replace(/\/$/, "");
  const envVal = getEnvPortalUrl(recyclerId);
  if (envVal) {
    return envVal.replace(/\/$/, "");
  }
  const route = PORTAL_ROUTES[recyclerId];
  const port = route ? route.defaultPort : 3101;
  return `http://localhost:${port}`;
}

export function getPortalBookingUrl(recyclerId: string, customBaseUrl?: string): string {
  const base = getPortalBaseUrl(recyclerId, customBaseUrl);
  const route = PORTAL_ROUTES[recyclerId];
  const path = route ? route.bookPath : "/book";
  return `${base}${path}`;
}

export function getPortalTrackingUrl(recyclerId: string, customBaseUrl?: string, ref?: string): string {
  const base = getPortalBaseUrl(recyclerId, customBaseUrl);
  const route = PORTAL_ROUTES[recyclerId];
  const path = route ? route.trackPath : "/track";
  return ref ? `${base}${path}?ref=${encodeURIComponent(ref)}` : `${base}${path}`;
}

export function getBookingReferenceRegex(recyclerId: string): RegExp {
  const route = PORTAL_ROUTES[recyclerId];
  return route ? route.refRegex : GENERIC_REF_REGEX;
}

export function isValidBookingReference(recyclerId: string, reference: string): boolean {
  if (!reference || typeof reference !== "string") return false;
  const trimmed = reference.trim();
  const regex = getBookingReferenceRegex(recyclerId);
  return regex.test(trimmed);
}
