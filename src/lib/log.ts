// Two kinds of log, both one JSON object per line:
//  - logEvent: structured events (requestId, provider, timings) to the console, so a log drain or
//    `grep` can follow a request end to end.
//  - writeLog: the run log in logs/YYYY-MM-DD.jsonl, so the team can replay what the agent did
//    during the stage demo. Never throws: on a read-only filesystem (e.g. serverless) it only
//    prints to the console.
// Never log keys or wallet secrets. Message text is logged only after the input guard has
// redacted it (emails, phone numbers, ID and card numbers), and only the first 200 characters.

import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { AgentResult } from "./types";

// path.resolve, not a process.cwd() join: a cwd join with a dynamic part makes the file tracer copy
// the whole project folder into every serverless function (and past Vercel's function limit).
const LOG_DIR = path.resolve(process.env.LOG_DIR || "logs");
const silent = () => process.env.LOG_SILENT === "1";

export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  if (silent()) return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

export type LogEntry =
  | {
      type: "agent";
      route: string;
      requestId: string;
      provider: AgentResult["provider"];
      model: string | null;
      ms: number;
      message: string; // guard-redacted, first 200 chars
      cards: { symbol: string; level: string; score: number }[];
      proposals: number;
      trace: { kind: string; name: string; ms: number; ok: boolean; summary: string }[];
      compliance: string;
      note?: string;
    }
  | { type: "protect"; proposalId: string; symbol: string; decision: string; mode: string; txHash: string | null }
  | { type: "trade_plan"; planId: string; symbol: string; side: string; amountThb: number; verdict: string }
  | { type: "trade"; planId: string; symbol: string; decision: string; mode: string; txHash: string | null }
  | { type: "error"; route: string; message: string };

export async function writeLog(entry: LogEntry): Promise<void> {
  if (silent()) return;
  if (entry.type !== "agent") logEvent(`run.${entry.type}`, entry);
  const line = { ts: new Date().toISOString(), ...entry };
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(path.join(LOG_DIR, `${line.ts.slice(0, 10)}.jsonl`), JSON.stringify(line) + "\n");
  } catch {
    // read-only filesystem: the console line from logEvent is the log
  }
}

export async function readRecentLogs(limit = 50): Promise<unknown[]> {
  try {
    const files = (await readdir(LOG_DIR)).filter((f) => f.endsWith(".jsonl")).sort().slice(-2);
    const lines: string[] = [];
    for (const f of files) lines.push(...(await readFile(path.join(LOG_DIR, f), "utf8")).split("\n").filter(Boolean));
    return lines.slice(-limit).reverse().map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
