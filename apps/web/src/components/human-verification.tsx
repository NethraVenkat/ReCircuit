"use client";
import { useEffect, useState } from "react";
import { api } from "./ui";
import { ErrorNotice } from "./feedback";

export function HumanVerification({ requestId, legId, planHash, handoff, busy, onSubmit }: {
  requestId: string; legId: string; planHash: string;
  handoff: { screenshotRef: string; expiresAt: string }; busy: boolean;
  onSubmit: (body: object) => Promise<void>;
}) {
  const [image, setImage] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const expired = Date.parse(handoff.expiresAt) <= now;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let active = true;
    const load = () => { void api(`/api/evidence-access?requestId=${encodeURIComponent(requestId)}&reference=${encodeURIComponent(handoff.screenshotRef)}`).then((r: { url: string }) => { if (active) setImage(r.url); }).catch((e: Error) => { if (active) setError(e.message); }); };
    load(); const timer = setInterval(load, 45000);
    return () => { active = false; clearInterval(timer); };
  }, [requestId, handoff.screenshotRef]);
  return <form onSubmit={e => { e.preventDefault(); const humanCode = code; setCode(""); void onSubmit({ requestId, legId, planHash, humanCode }); }}>
    <p>Read the verification image below and enter its five characters yourself. The agent cannot solve it. Your approval and policy expiry are checked again before submission.</p>
    {image && <a href={image} target="_blank" rel="noreferrer">Open private verification screenshot</a>}
    {error && <ErrorNotice message={error}/>}
    <label>Verification code<input aria-label="Verification code" autoComplete="off" value={code} maxLength={5} pattern="[a-zA-Z0-9]{5}" required onChange={e => setCode(e.target.value)} disabled={busy || expired}/></label>
    <p>Session expires {new Date(handoff.expiresAt).toLocaleTimeString()}. {expired && "Expired sessions require reconciliation; automatic resubmission is blocked."}</p>
    <button disabled={busy || expired || code.length !== 5} type="submit">Continue approved pickup</button>
  </form>;
}
