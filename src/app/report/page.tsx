"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataBadge } from "@/components/DataBadge";
import { compact, engineLabel, LEVEL_LABEL, pct, shortDate, usd } from "@/lib/format";
import { readReport, type ReportData } from "@/lib/report";
import type { RecipientClass } from "@/lib/types";

const RECIPIENT_TH: Record<RecipientClass, string> = {
  team: "Team",
  investor: "Investors",
  community: "Community",
  other: "Other",
  reserve: "Project reserve",
  ecosystem: "Ecosystem development fund",
};

// Printable A4 summary of one U-Guard answer. Opens the print dialog once fonts are ready.
export default function ReportPage() {
  const [data, setData] = useState<ReportData | null | undefined>(undefined);

  useEffect(() => {
    const d = readReport();
    setData(d);
    const preview = new URLSearchParams(window.location.search).has("preview");
    if (d && !preview) document.fonts.ready.then(() => setTimeout(() => window.print(), 300));
  }, []);

  if (data === undefined) return null;
  if (data === null) {
    return (
      <main className="report-page">
        <p>Nothing to summarise yet. Open the Terminal, ask U-Guard, then press &ldquo;Save as PDF&rdquo; again.</p>
        <Link href="/terminal">Back to the Terminal</Link>
      </main>
    );
  }

  const { question, result, at } = data;
  const sample = result.cards.some((c) => c.source.mode === "sample");

  return (
    <main className="report-page">
      <div className="no-print report-actions">
        <button className="btn btn-primary" onClick={() => window.print()}>
          Save as PDF
        </button>
        <Link href="/terminal" className="btn">
          Back to the Terminal
        </Link>
      </div>

      <header className="report-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/icon.png"
          width={44}
          height={44}
          alt="U-Guard"
          style={{ borderRadius: 10, objectFit: "cover", boxShadow: "0 0 14px rgba(45,212,191,0.3)" }}
        />
        <div>
          <h1>Token unlock risk check: summary</h1>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 4 }}>
            <p style={{ margin: 0 }}>
              U-Guard in U-Bot · {new Date(at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })} ·{" "}
              {engineLabel(result)}
            </p>
            <DataBadge
              status={sample ? "DEMO" : "CACHED"}
              source="U-Guard Engine"
              date={at}
              label="Provenance"
            />
          </div>
        </div>
      </header>

      <section>
        <h2>Question</h2>
        <p>{question}</p>
        <h2>U-Guard's answer</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{result.reply}</p>
      </section>

      {result.cards.map((c) => (
        <section key={c.symbol} className="report-card">
          <h2>
            {c.symbol} · {c.name} — {LEVEL_LABEL[c.level]}
            {c.level !== "none" ? ` (${c.score}/100)` : ""}
          </h2>
          {c.level !== "none" && (
            <table>
              <tbody>
                <tr>
                  <th>Unlock date</th>
                  <td>{c.unlockDate ? shortDate(c.unlockDate) : "–"}</td>
                  <th>Amount</th>
                  <td>
                    {compact(c.amount)} {c.symbol} (~{usd(c.valueUsd)})
                  </td>
                </tr>
                <tr>
                  <th>% of circulating supply</th>
                  <td>{pct(c.pctOfCirculating)}</td>
                  <th>vs trading volume</th>
                  <td>{c.daysOfVolume === null ? "–" : `${c.daysOfVolume.toFixed(2)} days`}</td>
                </tr>
                <tr>
                  <th>Latest round investors' profit</th>
                  <td>{c.investorMultiple === null ? "–" : `~${c.investorMultiple.toFixed(1)}×`}</td>
                  <th>Recipients</th>
                  <td>{c.breakdown.map((b) => `${RECIPIENT_TH[b.recipient]} ${Math.round(b.share * 100)}%`).join(" · ")}</td>
                </tr>
              </tbody>
            </table>
          )}
          <ul>
            {c.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      ))}

      {result.proposals.length > 0 && (
        <section>
          <h2>Protection proposals (need the user's approval)</h2>
          <ul>
            {result.proposals.map((p) => (
              <li key={p.id}>
                <b>{p.title}</b> — {p.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.trace.length > 0 && (
        <section>
          <h2>What the agent did</h2>
          <ol className="report-trace">
            {result.trace.map((t, i) => (
              <li key={`${t.name}-${i}`}>
                <code>{t.name}</code> — {t.summary}
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="report-foot">
        <p>
          Sources: Tokenomist ({sample ? "sample data for the demo" : "live data"}) · prices and volume: CoinGecko / sample data ·
          the score follows Keyrock research (16,000+ unlock events) and is computed in code, not by AI
        </p>
        <p>
          This document is decision support, not investment advice. U-Guard does not recommend buying, selling or holding any asset.
          Investing in digital assets is high risk.
        </p>
      </footer>
    </main>
  );
}
