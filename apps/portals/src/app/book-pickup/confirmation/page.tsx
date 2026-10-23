import { DeccanLayout } from "@/components/DeccanLayout";
import { BookingConfirmation } from "@/components/BookingConfirmation";
import { getRepository } from "@/lib/repository";
export const dynamic = "force-dynamic";
export default async function ConfirmationPage({ searchParams }: { searchParams: { ref?: string; dup?: string } }): Promise<JSX.Element> {
  const reference = (searchParams.ref || "").trim();
  const booking = reference ? await getRepository().getBookingByReference("deccan", reference) : null;
  return <DeccanLayout activePath="/book-pickup"><BookingConfirmation booking={booking} reference={reference} duplicate={searchParams.dup === "true"} trackPath="/track"/></DeccanLayout>;
}