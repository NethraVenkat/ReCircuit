import { PaperPlusLayout } from "@/components/PaperPlusLayout";
import { BookingConfirmation } from "@/components/BookingConfirmation";
import { getRepository } from "@/lib/repository";
export const dynamic = "force-dynamic";
export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ ref?: string; dup?: string }> }): Promise<JSX.Element> {
  const query = await searchParams;
  const reference = (query.ref || "").trim();
  const booking = reference ? await getRepository().getBookingByReference("paperplus", reference) : null;
  return <PaperPlusLayout activePath="/schedule"><BookingConfirmation booking={booking} reference={reference} duplicate={query.dup === "true"} trackPath="/status"/></PaperPlusLayout>;
}