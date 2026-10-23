import { QuickScrapLayout } from "@/components/QuickScrapLayout";
import { BookingConfirmation } from "@/components/BookingConfirmation";
import { getRepository } from "@/lib/repository";
export const dynamic = "force-dynamic";
export default async function ConfirmationPage({ searchParams }: { searchParams: { ref?: string; dup?: string } }): Promise<JSX.Element> {
  const reference = (searchParams.ref || "").trim();
  const booking = reference ? await getRepository().getBookingByReference("quickscrap", reference) : null;
  return <QuickScrapLayout activePath="/pickup"><BookingConfirmation booking={booking} reference={reference} duplicate={searchParams.dup === "true"} trackPath="/track-order"/></QuickScrapLayout>;
}