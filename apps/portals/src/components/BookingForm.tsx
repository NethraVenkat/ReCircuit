"use client";
import { RecyclingLoader } from "../../../../packages/ui/recycling-loader";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PortalFeedback } from "./PortalFeedback";
import { getAvailableSlots, RECYCLER_CONFIGS } from "@/lib/config";
import { SERVICEABLE_PINCODES, type BookingItemInput, type RecyclerId } from "@/lib/types";

interface BookingFormProps {
  recyclerId: RecyclerId;
}

function getApiPrefix(recyclerId: RecyclerId): string {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/portal/")) {
    return `/portal/${recyclerId}`;
  }
  return "";
}

export function BookingForm({ recyclerId }: BookingFormProps): JSX.Element {
  const router = useRouter();
  const config = RECYCLER_CONFIGS[recyclerId];

  // Form states
  const [clientRequestId, setClientRequestId] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [locality, setLocality] = useState("Kukatpally");
  const [pincode, setPincode] = useState("500072");
  const [preferredSlot, setPreferredSlot] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [dataWipeAck, setDataWipeAck] = useState(false);
  const [captchaSessionId, setCaptchaSessionId] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);

  // Default item based on recycler
  const getDefaultItems = (rId: string): BookingItemInput[] => {
    if (rId === "deccan") return [{ name: "Dell Laptop", quantity: 1, weightKg: 2.2 }];
    if (rId === "paperplus") return [{ name: "Old Newspaper", quantity: 1, weightKg: 8.0 }];
    return [{ name: "Old Electronics & Books", quantity: 2, weightKg: 6.0 }];
  };

  // Items list
  const [items, setItems] = useState<BookingItemInput[]>(() => getDefaultItems(recyclerId));
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState<number>(1);
  const [itemWeight, setItemWeight] = useState<number>(5);

  const totalWeight = items.reduce((sum, item) => sum + (item.weightKg ?? 0), 0);
  const [computedFee, setComputedFee] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(true);
  const [feeError, setFeeError] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [validationErrors, setValidationErrors] = useState<{ field: string; message: string }[]>([]);

  const slots = getAvailableSlots();

  useEffect(() => {
    const controller = new AbortController();
    const apiPrefix = getApiPrefix(recyclerId);
    setFeeLoading(true); setComputedFee(null); setFeeError("");
    fetch(`${apiPrefix}/api/fee?weight=${totalWeight}`, { headers: { "x-recycler-id": recyclerId }, signal: controller.signal })
      .then(async res => { if (!res.ok) throw new Error(`Fee lookup returned HTTP ${res.status}`); return res.json(); })
      .then(data => { if (!controller.signal.aborted) setComputedFee(typeof data.fee === "number" ? data.fee : null); })
      .catch((error: Error) => { if (!controller.signal.aborted) setFeeError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setFeeLoading(false); });
    return () => controller.abort();
  }, [totalWeight, recyclerId]);
  useEffect(() => { if (errorMessage) document.getElementById("portal-form-error")?.focus(); }, [errorMessage]);

  // Initialize defaults
  useEffect(() => {
    // Generate a default client_request_id if none exists
    const randId = `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    setHydrated(true);
    setClientRequestId(randId);
    if (slots.length > 0) {
      setPreferredSlot(slots[0] || "");
    }

    // Initialize CAPTCHA for PaperPlus
    if (recyclerId === "paperplus") {
      const apiPrefix = getApiPrefix(recyclerId);
      fetch(`${apiPrefix}/api/captcha`, {
        headers: { "x-recycler-id": recyclerId },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.sessionId) setCaptchaSessionId(data.sessionId);
        })
        .catch(() => {});
    }
  }, [recyclerId]);

  const refreshCaptcha = (): void => {
    const apiPrefix = getApiPrefix(recyclerId);
    fetch(`${apiPrefix}/api/captcha`, {
      headers: { "x-recycler-id": recyclerId },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.sessionId) {
          setCaptchaSessionId(data.sessionId);
          setCaptchaKey((k) => k + 1);
        }
      });
  };

  const handleAddItem = (): void => {
    if (!itemName.trim() || !Number.isInteger(itemQty) || itemQty < 1 || !Number.isFinite(itemWeight) || itemWeight <= 0) {
      setErrorMessage("Enter an item description, a whole-number quantity of at least 1, and a positive total row weight before adding it."); return;
    }
    setErrorMessage("");
    setItems((prev) => [
      ...prev,
      {
        name: itemName.trim(),
        quantity: itemQty,
        weightKg: itemWeight,
      },
    ]);
    setItemName("");
  };

  const handleRemoveItem = (index: number): void => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Check if laptop or phone in items
  const containsLaptopOrPhone = items.some((item) => {
    const l = item.name.toLowerCase();
    return l.includes("laptop") || l.includes("phone") || l.includes("mobile") || l.includes("notebook");
  });

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (loading || feeLoading || computedFee === null) return;
    setLoading(true);
    setErrorMessage("");
    setValidationErrors([]);

    const domClientReq =
      (typeof document !== "undefined"
        ? (document.querySelector('[data-testid="client-request-id"]') as HTMLInputElement)?.value
        : undefined) || clientRequestId;

    const payload = {
      client_request_id: domClientReq,
      full_name: fullName,
      phone,
      address_line: addressLine,
      locality,
      pincode,
      preferred_slot: preferredSlot,
      items,
      data_wipe_ack: dataWipeAck,
      human_verification_code: captchaCode,
      captcha_session_id: captchaSessionId,
    };

    try {
      const apiPrefix = getApiPrefix(recyclerId);
      const res = await fetch(`${apiPrefix}/api/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-captcha-session": captchaSessionId,
          "x-recycler-id": recyclerId,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 500) {
        const text = await res.text();
        setErrorMessage(text || "HTTP 500: Internal Server Error occurred on the recycler portal");
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Submission failed");
        if (data.errors) {
          setValidationErrors(data.errors);
        }
        setLoading(false);
        return;
      }

      // Successful booking -> navigate to confirmation page
      const ref = data.omitReference ? "" : data.booking?.bookingReference || "";

      const pathPrefix = apiPrefix;
      const confirmPath = `${pathPrefix}${config.routes.confirmation}?ref=${encodeURIComponent(ref)}${
        data.isDuplicate ? "&dup=true" : ""
      }`;
      router.push(confirmPath);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Network error during booking submission");
      setLoading(false);
    }
  };

  // Color schemes based on recycler
  const isDeccan = recyclerId === "deccan";
  const isPaperPlus = recyclerId === "paperplus";

  return (
    <form
      data-testid="booking-form"
      data-hydrated={hydrated ? "true" : "false"}
      onSubmit={handleSubmit}
      onInvalid={e => (e.target as HTMLInputElement).setAttribute("aria-invalid", "true")}
      onInput={e => (e.target as HTMLInputElement).removeAttribute("aria-invalid")}
      aria-busy={loading}
      className={`p-6 rounded-lg border shadow-xs space-y-6 ${
        isDeccan
          ? "bg-white border-emerald-200"
          : isPaperPlus
          ? "bg-emerald-50/60 border-emerald-300"
          : "bg-white border-slate-800 text-slate-900"
      }`}
    >
      {/* Hidden Client Request ID for Idempotency Protection */}
      <input
        type="hidden"
        name="client_request_id"
        data-testid="client-request-id"
        value={clientRequestId}
        onChange={(e) => setClientRequestId(e.target.value)}
      />

      <p className="text-sm">Fields marked * are required. Weight means the total for all units in each row.</p>
      {errorMessage && <div id="portal-form-error" tabIndex={-1} data-testid="form-error-banner">
        <PortalFeedback message={errorMessage} title="Your submission needs review. Check the fields and saved status before retrying."/>
        {validationErrors.length > 0 && <ul className="mt-3 space-y-2 text-sm text-red-800">{validationErrors.map((v, i) => <li key={i}><a href={`#${v.field}`}>{v.message}</a></li>)}</ul>}
      </div>}

      {/* Customer Info Section */}
      <div className="space-y-4">
        <h3 className="text-base font-bold border-b pb-2">Customer & Contact Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="full_name" className="block text-xs font-semibold mb-1">Full Name *</label>
            <input
              id="full_name"
              type="text"
              name="full_name"
              autoComplete="name"
              data-testid="input-fullname"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ramesh Reddy"
              className="w-full px-3 py-2 border rounded-sm text-sm text-slate-900 bg-white"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-xs font-semibold mb-1">Mobile Phone (10 digits) *</label>
            <input
              id="phone"
              type="tel"
              name="phone"
              pattern="[6-9][0-9]{9}" maxLength={10} autoComplete="tel" inputMode="tel"
              data-testid="input-phone"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              className="w-full px-3 py-2 border rounded-sm text-sm text-slate-900 bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label htmlFor="address_line" className="block text-xs font-semibold mb-1">Address Line *</label>
            <input
              id="address_line"
              type="text"
              name="address_line"
              autoComplete="street-address"
              data-testid="input-address"
              required
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              placeholder="Plot 42, Road No 3"
              className="w-full px-3 py-2 border rounded-sm text-sm text-slate-900 bg-white"
            />
          </div>
          <div>
            <label htmlFor="locality" className="block text-xs font-semibold mb-1">Locality *</label>
            <input
              id="locality"
              type="text"
              name="locality"
              data-testid="input-locality"
              required
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              placeholder="Kukatpally"
              className="w-full px-3 py-2 border rounded-sm text-sm text-slate-900 bg-white"
            />
          </div>
          <div>
            <label htmlFor="pincode" className="block text-xs font-semibold mb-1">Pincode (Hyderabad) *</label>
            <select
              id="pincode"
              name="pincode"
              data-testid="input-pincode"
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              className="w-full px-3 py-2 border rounded-sm text-sm text-slate-900 bg-white font-medium"
            >
              {SERVICEABLE_PINCODES.map((pin) => (
                <option key={pin} value={pin}>
                  {pin}
                </option>
              ))}
              <option value="500001">500001 (Non-serviceable test)</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="preferred_slot" className="block text-xs font-semibold mb-1">Requested pickup slot (IST) *</label>
          <select
            id="preferred_slot"
            name="preferred_slot"
            data-testid="select-slot"
            value={preferredSlot}
            onChange={(e) => setPreferredSlot(e.target.value)}
            className="w-full px-3 py-2 border rounded-sm text-sm text-slate-900 bg-white"
          >
            {slots.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="portal-form-hint">The selected slot is a request. A dispatcher-assigned slot appears separately in tracking.</p>
      {/* Items Section */}
      <div className="space-y-3 pt-2">
        <h3 className="text-base font-bold border-b pb-2 flex justify-between items-center">
          <span>Items to Recycle / Sell</span>
          {isPaperPlus && <span className="text-xs text-emerald-700 font-semibold">Min 5 kg Total Required</span>}
        </h3>

        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              data-testid="item-row"
              className="flex items-center justify-between p-3 rounded-sm border text-sm bg-slate-50 text-slate-800"
            >
              <div>
                <span data-testid="item-row-name" className="font-bold">{item.name}</span>
                {item.quantity && <span data-testid="item-row-qty" className="ml-2 text-xs text-slate-600">Qty: {item.quantity}</span>}
                {item.weightKg && <span data-testid="item-row-weight" className="ml-2 text-xs text-slate-600">Total row weight: {item.weightKg} kg</span>}
              </div>
              <button
                type="button"
                data-testid="remove-item"
                onClick={() => handleRemoveItem(idx)}
                className="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="portal-item-fields pt-3">
          <div><label htmlFor="input_item_name">Add item description</label><input id="input_item_name" type="text" data-testid="input-item-name" value={itemName} onChange={e => setItemName(e.target.value)} placeholder="e.g. Newspaper or laptop" className="px-3 py-2 border rounded-sm text-slate-900 bg-white"/></div>
          <div><label htmlFor="input_item_qty">Quantity (units)</label><input id="input_item_qty" type="number" data-testid="input-item-qty" value={Number.isFinite(itemQty) ? itemQty : ""} onChange={e => setItemQty(e.target.valueAsNumber)} min="1" step="1" className="px-3 py-2 border rounded-sm text-slate-900 bg-white"/></div>
          <div><label htmlFor="input_item_weight">Total row weight (kg)</label><input id="input_item_weight" type="number" data-testid="input-item-weight" value={Number.isFinite(itemWeight) ? itemWeight : ""} onChange={e => setItemWeight(e.target.valueAsNumber)} min="0" step="any" className="px-3 py-2 border rounded-sm text-slate-900 bg-white"/></div>
          <button type="button" data-testid="add-item" onClick={handleAddItem} className="px-3 py-2 rounded-sm border border-slate-400 bg-slate-200 text-slate-800 hover:bg-slate-300">+ Add item</button>
        </div>
        <p className="portal-form-hint">Current total: {totalWeight} kg across {items.length} item rows.</p>
      </div>

      {/* Deccan Data-Wipe Acknowledgement */}
      {isDeccan && containsLaptopOrPhone && (
        <div
          data-testid="data-wipe-panel"
          className="p-4 rounded-sm border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs space-y-2"
        >
          <div className="flex items-start space-x-2">
            <input
              id="data_wipe_ack"
              required
              type="checkbox"
              name="data_wipe_ack"
              data-testid="data-wipe-ack"
              checked={dataWipeAck}
              onChange={(e) => setDataWipeAck(e.target.checked)}
              className="mt-0.5 rounded-sm border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <label htmlFor="data_wipe_ack" className="font-semibold leading-relaxed cursor-pointer">
              I acknowledge that any data stored on submitted laptops, hard drives, or mobile phones has been backed up
              or requires destruction by the recycler. This declaration does not establish that data destruction or collection has occurred.
            </label>
          </div>
        </div>
      )}

      {/* PaperPlus Human Verification (CAPTCHA) Panel */}
      {isPaperPlus && (
        <div
          data-human-verification="required"
          data-testid="human-verification-panel"
          className="p-4 rounded-sm border-2 border-emerald-500 bg-emerald-100/90 text-emerald-950 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center space-x-1">
              <span>🛡️ Security Verification Required</span>
            </span>
            <button
              type="button"
              onClick={refreshCaptcha}
              className="text-[11px] text-emerald-800 hover:text-emerald-950 underline font-semibold"
            >
              Refresh Image
            </button>
          </div>

          <p className="text-xs text-emerald-800">
            Please enter the 5-character verification code shown below. The code is rendered as an image for human
            verification.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            {captchaSessionId && (
              <div className="border border-emerald-400 rounded-sm p-1 bg-white shadow-inner">
                {/* Image has no code text in the DOM or source! */}
                <img
                  key={captchaKey}
                  src={`${getApiPrefix(recyclerId)}/api/captcha?sid=${captchaSessionId}&t=${captchaKey}`}
                  alt="Security verification code"
                  data-testid="captcha-image"
                  className="h-16 w-52 object-contain"
                />
              </div>
            )}
            <div className="flex-1 w-full">
              <label htmlFor="human_verification_code" className="block text-xs font-bold mb-1">Enter Verification Code *</label>
              <input
                id="human_verification_code"
                type="text"
                name="human_verification_code"
                data-testid="input-captcha-code"
                required
                maxLength={5}
                minLength={5}
                pattern="[A-Za-z0-9]{5}"
                value={captchaCode}
                onChange={(e) => setCaptchaCode(e.target.value.toUpperCase())}
                placeholder="Enter 5 characters"
                className="w-full px-3 py-2 border rounded-sm font-sans font-bold tracking-widest text-center text-emerald-950 uppercase bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Review Step with Portal-Computed Pickup Fee */}
      <div
        data-testid="review-step"
        className="p-4 rounded-lg border bg-slate-50 text-slate-900 space-y-2"
      >
        <div className="text-xs uppercase font-bold tracking-wider text-slate-500">
          Review Pickup Details & Fee
        </div>
        {feeLoading ? <RecyclingLoader label="Checking the pickup fee…"/> : computedFee !== null && typeof computedFee === "number" ? (
          <div
            data-testid="portal-computed-fee"
            className="text-base font-bold text-slate-900"
          >
            Pickup charge for this request: ₹{computedFee}
          </div>
        ) : (
          <div
            data-testid="portal-fee-notice"
            className="text-sm italic text-slate-500"
          >
            The pickup fee is unavailable. This does not mean pickup is free; review the fee with the recycler before proceeding.
          </div>
        )}
        {feeError && <PortalFeedback message={feeError} title="The pickup fee could not be checked."/>}
        <p className="text-xs text-slate-600">
          Please review your items, address, and slot above before confirming your booking.
        </p>
      </div>

      {loading && <RecyclingLoader label="Submitting your pickup request..."/>}
      {/* Confirm Booking Button */}
      <div className="pt-2">
        <button
          type="submit"
          data-testid="confirm-booking"
          disabled={loading || feeLoading || computedFee === null}
          className={`w-full py-3 px-6 rounded-md font-bold text-sm shadow-sm transition-all ${
            isDeccan
              ? "bg-emerald-700 hover:bg-emerald-800 text-white"
              : isPaperPlus
              ? "bg-emerald-800 hover:bg-emerald-700 text-white"
              : "bg-emerald-800 hover:bg-emerald-700 text-white"
          } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {loading ? "Submitting Pickup Request..." : "Confirm booking"}
        </button>
      </div>
    </form>
  );
}

