import { DeccanLayout } from "@/components/DeccanLayout";
import { BookingConfirmation } from "@/components/BookingConfirmation";
import { getRepository } from "@/lib/repository";
export const dynamic = "force-dynamic";
export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ ref?: string; dup?: string }> }): Promise<JSX.Element> {
  const query = await searchParams;
  const reference = (query.ref || "").trim();
  const booking = reference ? await getRepository().getBookingByReference("deccan", reference) : null;
  return <DeccanLayout activePath="/book-pickup"><BookingConfirmation booking={booking} reference={reference} duplicate={query.dup === "true"} trackPath="/track"/></DeccanLayout>;
}