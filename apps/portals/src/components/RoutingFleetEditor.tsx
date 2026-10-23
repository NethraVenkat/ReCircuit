"use client";
import React, { useEffect, useState } from "react";
import type { WorkspaceSettings } from "../lib/geospatial/service";
import type { RoutingVehicle } from "../lib/geospatial/contracts";
export function RoutingFleetEditor({ settings, busy, save }: { settings: WorkspaceSettings; busy: boolean; save: (vehicles: RoutingVehicle[]) => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>(settings.vehicles.map(v => v.id));
  useEffect(() => setSelected(settings.vehicles.map(v => v.id)), [settings.version]);
  const text = (data: FormData, name: string) => { const value = data.get(name); return typeof value === "string" ? value.trim() : ""; };
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), id = text(data, "vehicle"), depotId = text(data, "depot");
    const clock = (s: string) => { const [h, m] = s.split(":").map(Number); return h! * 3600 + m! * 60; };
    const start = clock(text(data, "start")); let end = clock(text(data, "end")); if (end < start) end += 86400;
    const depot = { id: depotId, coordinate: { lat: Number(text(data, "lat")), lon: Number(text(data, "lon")) } };
    const vehicle: RoutingVehicle = { id, tenant: settings.tenant, version: crypto.randomUUID(), provenance: text(data, "source"), start: depot, end: depot, capacityKg: Number(text(data, "capacity")), initialLoadKg: Number(text(data, "initial")), materials: text(data, "materials").split(",").map(s => s.trim()).filter(Boolean), operatingWindow: { start, end } };
    void save([...settings.vehicles.filter(v => v.id !== id), vehicle]);
  }
  return <><fieldset disabled={busy}><legend>Vehicles to retain in the next planning configuration</legend>{settings.vehicles.map(v => <label key={v.id} className="routing-check"><input type="checkbox" checked={selected.includes(v.id)} onChange={e => setSelected(e.target.checked ? [...selected, v.id] : selected.filter(id => id !== v.id))}/>{v.id} · {v.capacityKg} kg · depot {v.start.id} → {v.end.id}</label>)}{settings.vehicles.length > 0 && <button disabled={!selected.length} onClick={() => void save(settings.vehicles.filter(v => selected.includes(v.id)))}>Use selected planning vehicles</button>}</fieldset><details><summary>Add or update a planning vehicle</summary><form onSubmit={submit} className="routing-controls">
    <label>Planning vehicle ID<input name="vehicle" required maxLength={160}/></label><label>Capacity (kg)<input name="capacity" required type="number" step="any" min="0.001"/></label><label>Initial load (kg)<input name="initial" required type="number" step="any" min="0"/></label><label>Compatible material categories (comma-separated)<input name="materials" required maxLength={500}/></label><label>Start and return depot ID<input name="depot" required maxLength={160}/></label><label>Depot latitude<input name="lat" required type="number" step="any" min="-90" max="90"/></label><label>Depot longitude<input name="lon" required type="number" step="any" min="-180" max="180"/></label><label>Operating start (IST)<input name="start" type="time" required/></label><label>Operating end (IST)<input name="end" type="time" required/></label><label>Configuration source/version<input name="source" required maxLength={160}/></label><p>End before start means the following day. This editor returns to the same depot and assumes no mid-route unloading. Advanced configuration can set distinct start/end depots.</p><button disabled={busy}>Save planning vehicle version</button></form></details></>;
}
