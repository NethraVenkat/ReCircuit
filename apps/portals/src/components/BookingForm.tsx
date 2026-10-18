"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAvailableSlots, RECYCLER_CONFIGS } from "@/lib/config";
import { SERVICEABLE_PINCODES, type BookingItemInput, type RecyclerId } from "@/lib/types";

interface BookingFormProps {
  recyclerId: RecyclerId;
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
  const [dataWipeAck, setDataWipeAck] = useState(false);
  const [captchaSessionId, setCaptchaSessionId] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);

  // Items list
  const [items, setItems] = useState<BookingItemInput[]>([]);
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState<number>(1);
  const [itemWeight, setItemWeight] = useState<number>(5);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [validationErrors, setValidationErrors] = useState<{ field: string; message: string }[]>([]);

  const slots = getAvailableSlots();

  // Initialize defaults
  useEffect(() => {
    // Generate a default client_request_id if none exists
    const randId = `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    setClientRequestId(randId);
    if (slots.length > 0) {
      setPreferredSlot(slots[0] || "");
    }

    // Default item based on recycler
    if (recyclerId === "deccan") {
      setItems([{ name: "Dell Laptop", quantity: 1, weightKg: 2.2 }]);
    } else if (recyclerId === "paperplus") {
      setItems([{ name: "Old Newspaper", quantity: 1, weightKg: 8.0 }]);
    } else {
      setItems([{ name: "Old Electronics & Books", quantity: 2, weightKg: 6.0 }]);
    }

    // Initialize CAPTCHA for PaperPlus
    if (recyclerId === "paperplus") {
      fetch("/api/captcha")
        .then((res) => res.json())
        .then((data) => {
          if (data.sessionId) setCaptchaSessionId(data.sessionId);
        })
        .catch(() => {});
    }
  }, [recyclerId]);

  const refreshCaptcha = (): void => {
    fetch("/api/captcha")
      .then((res) => res.json())
      .then((data) => {
        if (data.sessionId) {
          setCaptchaSessionId(data.sessionId);
          setCaptchaKey((k) => k + 1);
        }
      });
  };

  const handleAddItem = (): void => {
    if (!itemName.trim()) return;
    setItems((prev) => [
      ...prev,
      {
        name: itemName.trim(),
        quantity: itemQty > 0 ? itemQty : undefined,
        weightKg: itemWeight > 0 ? itemWeight : undefined,
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
    setLoading(true);
    setErrorMessage("");
    setValidationErrors([]);

    const payload = {
      client_request_id: clientRequestId,
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
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-captcha-session": captchaSessionId,
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
      const confirmPath = `${config.routes.confirmation}?ref=${encodeURIComponent(ref)}${
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
      onSubmit={handleSubmit}
      className={`p-6 rounded-lg border shadow-sm space-y-6 ${
        isDeccan
          ? "bg-white border-emerald-200"
          : isPaperPlus
          ? "bg-amber-50/60 border-amber-300"
          : "bg-slate-900 border-slate-800 text-slate-100"
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

      {errorMessage && (
        <div
          data-testid="form-error-banner"
          className="p-4 rounded border text-sm font-semibold bg-red-50 text-red-700 border-red-300"
        >
          <p className="font-bold">Submission Blocked:</p>
          <p>{errorMessage}</p>
          {validationErrors.length > 0 && (
            <ul className="list-disc list-inside mt-2 text-xs space-y-1">
              {validationErrors.map((v, i) => (
                <li key={i}>{v.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Customer Info Section */}
      <div className="space-y-4">
        <h3 className="text-base font-bold border-b pb-2">Customer & Contact Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Full Name *</label>
            <input
              type="text"
              name="full_name"
              data-testid="input-fullname"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ramesh Reddy"
              className="w-full px-3 py-2 border rounded text-sm text-slate-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Mobile Phone (10 digits) *</label>
            <input
              type="tel"
              name="phone"
              data-testid="input-phone"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              className="w-full px-3 py-2 border rounded text-sm text-slate-900 bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold mb-1">Address Line *</label>
            <input
              type="text"
              name="address_line"
              data-testid="input-address"
              required
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              placeholder="Plot 42, Road No 3"
              className="w-full px-3 py-2 border rounded text-sm text-slate-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Locality *</label>
            <input
              type="text"
              name="locality"
              data-testid="input-locality"
              required
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              placeholder="Kukatpally"
              className="w-full px-3 py-2 border rounded text-sm text-slate-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Pincode (Hyderabad) *</label>
            <select
              name="pincode"
              data-testid="input-pincode"
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm text-slate-900 bg-white font-medium"
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
          <label className="block text-xs font-semibold mb-1">Preferred Pickup Slot (IST) *</label>
          <select
            name="preferred_slot"
            data-testid="select-slot"
            value={preferredSlot}
            onChange={(e) => setPreferredSlot(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm text-slate-900 bg-white"
          >
            {slots.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Items Section */}
      <div className="space-y-3 pt-2">
        <h3 className="text-base font-bold border-b pb-2 flex justify-between items-center">
          <span>Items to Recycle / Sell</span>
          {isPaperPlus && <span className="text-xs text-amber-700 font-semibold">Min 5 kg Total Required</span>}
        </h3>

        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              data-testid="item-row"
              className="flex items-center justify-between p-3 rounded border text-sm bg-slate-50 text-slate-800"
            >
              <div>
                <span className="font-bold">{item.name}</span>
                {item.quantity && <span className="ml-2 text-xs text-slate-600">Qty: {item.quantity}</span>}
                {item.weightKg && <span className="ml-2 text-xs text-slate-600">Weight: {item.weightKg} kg</span>}
              </div>
              <button
                type="button"
                onClick={() => handleRemoveItem(idx)}
                className="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {/* Add Item Row */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <input
            type="text"
            data-testid="input-item-name"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="Add another item (e.g. Newspaper, Laptop)"
            className="flex-1 min-w-[200px] px-3 py-2 border rounded text-sm text-slate-900 bg-white"
          />
          <input
            type="number"
            data-testid="input-item-qty"
            value={itemQty}
            onChange={(e) => setItemQty(parseInt(e.target.value) || 0)}
            placeholder="Qty"
            className="w-20 px-3 py-2 border rounded text-sm text-slate-900 bg-white"
            min="0"
          />
          <input
            type="number"
            data-testid="input-item-weight"
            value={itemWeight}
            onChange={(e) => setItemWeight(parseFloat(e.target.value) || 0)}
            placeholder="Kg"
            step="0.5"
            className="w-20 px-3 py-2 border rounded text-sm text-slate-900 bg-white"
            min="0"
          />
          <button
            type="button"
            data-testid="add-item"
            onClick={handleAddItem}
            className="px-3 py-2 rounded text-xs font-bold border border-slate-400 bg-slate-200 text-slate-800 hover:bg-slate-300"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Deccan Data-Wipe Acknowledgement */}
      {isDeccan && containsLaptopOrPhone && (
        <div
          data-testid="data-wipe-panel"
          className="p-4 rounded border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs space-y-2"
        >
          <label className="flex items-start space-x-2 cursor-pointer">
            <input
              type="checkbox"
              name="data_wipe_ack"
              data-testid="data-wipe-ack"
              checked={dataWipeAck}
              onChange={(e) => setDataWipeAck(e.target.checked)}
              className="mt-0.5 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="font-semibold leading-relaxed">
              I acknowledge that any data stored on submitted laptops, hard drives, or mobile phones has been backed up
              or will be permanently destroyed in accordance with Deccan E-Cycle CPCB certified recycling procedures.
            </span>
          </label>
        </div>
      )}

      {/* PaperPlus Human Verification (CAPTCHA) Panel */}
      {isPaperPlus && (
        <div
          data-human-verification="required"
          data-testid="human-verification-panel"
          className="p-4 rounded border-2 border-amber-500 bg-amber-100/90 text-amber-950 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center space-x-1">
              <span>🛡️ Security Verification Required</span>
            </span>
            <button
              type="button"
              onClick={refreshCaptcha}
              className="text-[11px] text-amber-800 hover:text-amber-950 underline font-semibold"
            >
              Refresh Image
            </button>
          </div>

          <p className="text-xs text-amber-800">
            Please enter the 5-character verification code shown below. The code is rendered as an image for human
            verification.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            {captchaSessionId && (
              <div className="border border-amber-400 rounded p-1 bg-white shadow-inner">
                {/* Image has no code text in the DOM or source! */}
                <img
                  key={captchaKey}
                  src={`/api/captcha?sid=${captchaSessionId}&t=${captchaKey}`}
                  alt="Security verification code"
                  data-testid="captcha-image"
                  className="h-16 w-52 object-contain"
                />
              </div>
            )}
            <div className="flex-1 w-full">
              <label className="block text-xs font-bold mb-1">Enter Verification Code *</label>
              <input
                type="text"
                name="human_verification_code"
                data-testid="input-captcha-code"
                required
                maxLength={6}
                value={captchaCode}
                onChange={(e) => setCaptchaCode(e.target.value.toUpperCase())}
                placeholder="Enter 5 characters"
                className="w-full px-3 py-2 border rounded font-mono font-bold tracking-widest text-center text-amber-950 uppercase bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          data-testid="submit-booking"
          disabled={loading}
          className={`w-full py-3 px-6 rounded-md font-bold text-sm shadow transition-all ${
            isDeccan
              ? "bg-emerald-700 hover:bg-emerald-800 text-white"
              : isPaperPlus
              ? "bg-amber-600 hover:bg-amber-700 text-white"
              : "bg-orange-600 hover:bg-orange-700 text-white"
          } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {loading ? "Submitting Pickup Request..." : `Submit Pickup Request to ${config.name}`}
        </button>
      </div>
    </form>
  );
}

