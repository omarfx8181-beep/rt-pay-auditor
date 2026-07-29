/**
 * The crash net. A render exception must NEVER become a white screen
 * over someone's pay history — the fallback says the data is safe,
 * proves it with a React-free backup download straight from Dexie,
 * and offers reload. Deliberately zero dependencies on app state.
 */
import { Component, type ReactNode } from "react";
import { db } from "../db/db.ts";
import { buildBackup } from "../lib/periods.ts";

async function rescueBackup(): Promise<void> {
  const periods = await db.periods.toArray();
  const otherIncome = await db.otherIncome.toArray();
  const settingRows = await db.settings.toArray();
  const settings = Object.fromEntries(settingRows.map((s) => [s.key, s.value]));
  const json = JSON.stringify(buildBackup(periods, otherIncome, settings, new Date().toISOString()), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `rt-pay-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

interface State {
  error: Error | null;
  rescueMsg: string;
  detailsOpen: boolean;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, rescueMsg: "", detailsOpen: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    // Anything can be thrown — normalize so the net always catches.
    return { error: error instanceof Error ? error : new Error(String(error ?? "Unknown error")) };
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
        <h1 className="text-title-2">Something broke — your numbers are safe.</h1>
        <p className="mt-3 text-body text-ink-dim">
          Everything you've entered is still stored on this device. Download a backup now, then reload.
        </p>
        <div className="mt-6 space-y-2.5">
          <button
            onClick={() => {
              rescueBackup()
                .then(() => this.setState({ rescueMsg: "Backup downloaded ✓" }))
                .catch((e: unknown) => this.setState({ rescueMsg: String(e instanceof Error ? e.message : e) }));
            }}
            className="btn btn-primary pressable w-full"
          >
            Download a backup
          </button>
          <button onClick={() => window.location.reload()} className="btn btn-ghost pressable w-full">
            Reload the app
          </button>
        </div>
        {this.state.rescueMsg !== "" && <p className="mt-3 text-footnote text-pos">{this.state.rescueMsg}</p>}
        <button
          onClick={() => this.setState((s) => ({ detailsOpen: !s.detailsOpen }))}
          className="pressable mt-6 min-h-11 text-left text-footnote text-ink-dim underline"
        >
          {this.state.detailsOpen ? "Hide" : "Show"} the error details
        </button>
        {this.state.detailsOpen && (
          <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-soft p-3 text-caption text-ink-dim">
            {String(this.state.error.stack ?? this.state.error.message)}
          </pre>
        )}
      </div>
    );
  }
}
