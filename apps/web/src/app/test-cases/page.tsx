"use client";

import { useState } from "react";
import Link from "next/link";

interface TestCaseRunResult {
  tc: string;
  title: string;
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  groundedEvidence: Record<string, any>;
  explanation: string;
}

export default function OfficialTestCasesPage() {
  const [results, setResults] = useState<Record<string, TestCaseRunResult>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [runningAll, setRunningAll] = useState(false);

  const testCasesMeta = [
    {
      id: "1",
      code: "TC1",
      title: "Old laptop accepted by centre → pickup draft created",
      description: "Verifies that an old laptop is matched to Deccan E-Cycle Solutions, under-weight standard fee ₹180 is extracted, and a pickup draft is created in AWAITING_APPROVAL.",
      sampleInput: "1 old Dell laptop",
    },
    {
      id: "2",
      code: "TC2",
      title: "Centre takes paper but not batteries → batteries rejected",
      description: "Verifies split routing when a centre accepts paper but rejects batteries. Paper is routed to PaperPlus Kabadi, while batteries are strictly rejected with grounded reason.",
      sampleInput: "1 stack of newspapers and 2 household AA batteries",
    },
    {
      id: "3",
      code: "TC3",
      title: "Pickup fee above user's limit → approval asked",
      description: "Verifies that when the estimated pickup fee (₹180) exceeds the user's declared budget (₹100), the router generates an explicit approval escalation warning (FEE_EXCEEDS_CAP).",
      sampleInput: "1 old laptop (budget: ₹100)",
    },
    {
      id: "4",
      code: "TC4",
      title: "Pickup requested → not reported as collected",
      description: "Verifies the zero-unverified-collection invariant: booking a pickup advances the leg to REQUEST_CONFIRMED, but isCollected remains strictly false. State machine blocks PICKED_UP without physical proof.",
      sampleInput: "Booking in REQUEST_CONFIRMED state",
    },
  ];

  async function runTestCase(tcId: string) {
    setRunning((prev) => ({ ...prev, [tcId]: true }));
    try {
      const res = await fetch(`/api/test-cases/run?tc=${tcId}`);
      const json = await res.json();
      setResults((prev) => ({ ...prev, [tcId]: json }));
    } catch (err) {
      console.error(err);
    } finally {
      setRunning((prev) => ({ ...prev, [tcId]: false }));
    }
  }

  async function runAllTestCases() {
    setRunningAll(true);
    for (const tc of testCasesMeta) {
      await runTestCase(tc.id);
    }
    setRunningAll(false);
  }

  return (
    <div className="space-y-8" data-testid="test-cases-dashboard">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-0.5 rounded font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
              Stage 10 Official Suite
            </span>
            <span className="text-xs text-slate-500 font-medium">Ziro.Digital Hackathon 2026 Requirements</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Official Reverse-Logistics Test Cases
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated verification runs for TC1 through TC4 with grounded evidence citations and invariant validation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            ← Household Intake
          </Link>
          <button
            data-testid="run-all-test-cases-button"
            type="button"
            onClick={runAllTestCases}
            disabled={runningAll}
            className="text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {runningAll ? "Executing All 4 Scenarios..." : "Run All 4 Official Test Cases"}
          </button>
        </div>
      </div>

      {/* 4 Test Case Cards */}
      <div className="grid grid-cols-1 gap-6">
        {testCasesMeta.map((tc) => {
          const res = results[tc.id];
          const isRunning = running[tc.id];

          return (
            <div
              key={tc.id}
              data-testid={`test-case-card-${tc.code.toLowerCase()}`}
              className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-slate-900 text-white font-mono font-bold flex items-center justify-center text-sm shadow-sm">
                    {tc.code}
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{tc.title}</h2>
                    <p className="text-xs text-slate-500">{tc.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {res && (
                    <span
                      data-testid={`badge-${tc.code.toLowerCase()}`}
                      className={`text-xs px-3 py-1 rounded-full font-bold ${
                        res.passed ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {res.passed ? "PASSED ✅" : "FAILED ❌"}
                    </span>
                  )}
                  <button
                    data-testid={`run-button-${tc.code.toLowerCase()}`}
                    type="button"
                    onClick={() => runTestCase(tc.id)}
                    disabled={isRunning}
                    className="text-xs px-3 py-1.5 rounded-md bg-slate-100 text-slate-800 hover:bg-slate-200 font-semibold transition-colors disabled:opacity-50"
                  >
                    {isRunning ? "Running..." : "Run Scenario"}
                  </button>
                </div>
              </div>

              {/* Execution Results View */}
              {res && (
                <div className="space-y-3 pt-3 border-t border-slate-100 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-lg">
                    <div>
                      <span className="text-slate-500 font-medium block">Scenario Input:</span>
                      <span className="font-mono text-slate-900 text-[11px] block mt-0.5">
                        {res.input}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">Expected Outcome:</span>
                      <span className="text-slate-700 text-[11px] block mt-0.5">
                        {res.expected}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-white border border-slate-200 rounded-lg">
                    <span className="text-slate-500 font-medium block">Actual Execution Result:</span>
                    <span className="font-mono text-slate-800 text-[11px] block mt-0.5">
                      {res.actual}
                    </span>
                  </div>

                  {/* Grounded Evidence Box */}
                  <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg space-y-1">
                    <span className="font-bold text-emerald-900 block flex items-center gap-1">
                      🔍 Grounded Policy Evidence & Citations:
                    </span>
                    <pre className="text-[11px] text-emerald-950 font-mono whitespace-pre-wrap">
                      {JSON.stringify(res.groundedEvidence, null, 2)}
                    </pre>
                  </div>

                  <p className="text-slate-600 text-[11px] italic">
                    <span className="font-semibold text-slate-700">Verification Rationale:</span> {res.explanation}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
