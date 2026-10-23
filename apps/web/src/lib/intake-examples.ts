import type { IntakeItem } from "@recircuit/core";

export const intakeExamples = [
  { id: "old-laptop", title: "Old laptop", summary: "1 laptop · 2.5 kg", description: "Start with one electronic item and review the recycling options.", fee: "500", items: [{ category: "laptop", rawText: "Old laptop", quantity: 1, declaredWeightKg: 2.5, hazardClass: "battery_li_ion" }] },
  { id: "paper-batteries", title: "Paper and batteries", summary: "8 kg newspapers + 4 batteries · 0.5 kg", description: "Compare how recycler policies handle two different materials.", fee: "500", items: [{ category: "newspaper", rawText: "Newspapers", quantity: 1, declaredWeightKg: 8, hazardClass: "none" }, { category: "battery_household", rawText: "Household batteries", quantity: 4, declaredWeightKg: 0.5, hazardClass: "battery_unknown" }] },
  { id: "pickup-budget", title: "Pickup budget", summary: "1 laptop · 2.5 kg · ₹100 limit", description: "Review pickup fees against a smaller budget before deciding.", fee: "100", items: [{ category: "laptop", rawText: "Old laptop", quantity: 1, declaredWeightKg: 2.5, hazardClass: "battery_li_ion" }] },
] as const;

export function exampleDraft(id: string): { items: IntakeItem[]; fee: string } | null {
  const example = intakeExamples.find(entry => entry.id === id);
  return example ? { items: example.items.map(item => ({ ...item, id: crypto.randomUUID(), weightSource: "user_declared", confidence: 1 })), fee: example.fee } : null;
}
