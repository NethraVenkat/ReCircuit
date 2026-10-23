export function PortalFeedback({ message, title = "This step could not be completed. Review the saved status before trying again." }: { message: string; title?: string }): JSX.Element {
  const diagnostic = message.replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]").replace(/([?&](?:token|key|signature|sig)=)[^&\s]+/gi, "$1[redacted]");
  return <div role="alert" className="portal-notice portal-notice--error"><p><strong>{title}</strong></p><details className="portal-diagnostics"><summary>Technical details</summary><pre>{diagnostic}</pre></details></div>;
}
