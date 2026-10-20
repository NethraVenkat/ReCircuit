-- Preserve the fee accepted at submission; historical unstated fees remain NULL.
ALTER TABLE portal.bookings
  ADD COLUMN charged_fee_inr numeric CHECK (charged_fee_inr >= 0);
