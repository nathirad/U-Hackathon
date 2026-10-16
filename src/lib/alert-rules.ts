// Alert rules: one shape for the alerts page (/api/alerts) and for U-Bot over MCP
// (create_alert_rule). Kept apart from the alert engine so the agent's tools can import it
// without an import cycle (alerts.ts runs those tools).

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { store, type AlertRule } from "./store";

export const AlertRuleInput = z.object({
  type: z.enum(["unlock", "drift", "news"]).default("unlock"),
  symbol: z.string().trim().toUpperCase().regex(/^(\*|[A-Z0-9.\-]{1,20})$/).default("*"),
  minLevel: z.enum(["medium", "high"]).default("medium"),
  daysBefore: z.number().int().min(1).max(30).default(7),
  channel: z.enum(["ubot", "telegram", "line"]).default("ubot"),
});

/** Adds a rule for one user. A rule that already exists is returned as is (created: false). */
export function addAlertRule(ownerId: string, input: z.infer<typeof AlertRuleInput>): { rule: AlertRule; created: boolean } {
  // symbol "*" = every holding; one drift rule covers the whole wallet.
  const data = input.type === "drift" ? { ...input, symbol: "*" } : input;
  const dup = store.alerts.find(
    (r) => r.ownerId === ownerId && (r.type ?? "unlock") === data.type && r.symbol === data.symbol && r.minLevel === data.minLevel && r.daysBefore === data.daysBefore,
  );
  if (dup) return { rule: dup, created: false };
  const rule: AlertRule = { id: randomUUID(), createdAt: new Date().toISOString(), ownerId, ...data };
  store.alerts.unshift(rule);
  store.alerts.splice(200);
  return { rule, created: true };
}
