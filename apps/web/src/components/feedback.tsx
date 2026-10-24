import { RecyclingLoader } from "../../../../packages/ui/recycling-loader";
import { errorSummary, safeDiagnostic } from "../lib/error-display";
export function ErrorNotice({ message, title, id }: { message: string; title?: string; id?: string }) {
  return <div id={id} tabIndex={id ? -1 : undefined} role="alert" className="rc-notice rc-error">
    <p><strong>{title || errorSummary(message)}</strong></p>
    <details className="rc-diagnostics"><summary>Technical details</summary><pre>{safeDiagnostic(message)}</pre></details>
  </div>;
}
export function ProgressNotice({ title }: { title: string; children?: React.ReactNode }) {
  return <RecyclingLoader label={title}/>;
}
