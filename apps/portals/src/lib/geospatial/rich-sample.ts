import type { RecyclerId, BookingItemInput } from "../types";
export const sampleNames = ["Mira Rao", "Arjun Shah", "Leela Menon", "Dev Kapoor", "Tara Nair", "Rohan Das", "Anika Sen", "Kabir Iyer", "Sana Ali", "Neel Joshi", "Asha Verma", "Ishaan Roy", "Cedar Design Studio", "Willow Bookshop", "Maple Office Services", "Lotus Learning Centre", "Saffron Cafe", "Kiran Mehta"];
export const sampleScenarios = ["awaiting-approval", "declined", "request-received", "awaiting-scheduling", "verified-awaiting-scheduling", "rescheduled", "cancelled", "completed", "preparation-needed", "ready", "ready", "ready", "ready", "ready", "capacity-exclusion", "window-exclusion", "ready", "fleet-material-exclusion"];
export function sampleItem(tenant: RecyclerId, index: number): BookingItemInput {
  const catalogue = tenant === "paperplus" ? [["Newspaper", "newspaper"], ["Cardboard boxes", "cardboard"], ["Office books", "books"]] : tenant === "deccan" ? [["Laptop", "laptop"], ["Desktop computer", "desktop"], ["Chargers", "charger"]] : [["Laptop", "laptop"], ["Newspaper", "paper"], ["Metal scrap", "metal"]];
  const [name, category] = index === 17 ? (tenant === "paperplus" ? ["Magazines", "magazines"] : tenant === "deccan" ? ["Household batteries", "battery"] : ["Plastic containers", "plastic"]) : catalogue[index % catalogue.length]!;
  const weightKg = index === 14 ? 120 : [9, 10, 11, 12, 13, 16].includes(index) ? ({9:18,10:20,11:12,12:16,13:14,16:10} as Record<number,number>)[index]! : tenant === "paperplus" ? 8 + index % 4 : 1.5 + index % 4;
  return { name: name!, category: category!, quantity: index === 14 ? 40 : index >= 9 ? 2 + index % 5 : 1 + index % 3, weightKg };
}
export function sampleFleetMaterials(tenant: RecyclerId): string[] { return tenant === "paperplus" ? ["newspaper", "cardboard", "books"] : tenant === "deccan" ? ["laptop", "desktop", "charger"] : ["laptop", "paper", "metal"]; }
