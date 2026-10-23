"use client";
import Link from "next/link";
import { intakeExamples } from "../lib/intake-examples";

export function IntakeExamples({ onSelect }: { onSelect?: (id: string) => void }) {
  return <section aria-label="Try an example" className="rc-examples">
    <h2>Try an example</h2>
    <p className="rc-secondary">A starting point for your draft. Review and edit the details, then compare current recycler policies.</p>
    <div className="rc-example-grid">{intakeExamples.map((example, index) => {
      const content = <><span className="rc-example-top"><span className="rc-example-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{index === 0 ? <path d="M5 4h14v12H5zM2 20h20l-3-4H5z"/> : index === 1 ? <path d="M3 4h11v16H3zM6 8h5M6 12h5M17 8h4v11h-4zM18 6h2"/> : <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M15 14h3"/></>}</svg></span><span className="rc-example-label">Example</span></span><strong>{example.title}</strong><span className="rc-example-summary">{example.summary}</span><span className="rc-secondary">{example.description}</span><span className="rc-example-link">Use this example <span aria-hidden="true">↗</span></span></>;
      return onSelect ? <button type="button" className="rc-example-card" key={example.id} onClick={() => onSelect(example.id)} aria-label={`Try ${example.title}`}>{content}</button> : <Link className="rc-example-card" key={example.id} href={`/arrange?example=${example.id}`} aria-label={`Try ${example.title}`}>{content}</Link>;
    })}</div>
  </section>;
}
