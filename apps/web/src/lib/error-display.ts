/** Preserve useful historical diagnostics without printing credentials or signed URLs. */
export function safeDiagnostic(message: string): string {
  return message.replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/([?&](?:token|key|api_key|signature|sig|authorization|x-amz-signature)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/((?:api[_ -]?key|service[_ -]?role[_ -]?key|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]");
}
export function errorSummary(message: string): string {
  if (/not found|NOT_FOUND/i.test(message)) return "This request is unavailable in this browser. Return to My pickups or check the request link.";
  if (/expir|stale/i.test(message)) return "This action needs current evidence. Review the saved request and refresh its plan before continuing.";
  if (/429|503|timed?\s*out|unavailable/i.test(message)) return "The service could not complete this step. Review the saved status before trying again.";
  return "This step could not be completed. Review the details and your saved status before continuing.";
}
