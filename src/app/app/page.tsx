"use client";

import { useEffect, useState } from "react";
import { Avatar, topLevel } from "@/components/Avatar";
import { RiskCardView } from "@/components/Cards";
import { ChatThread } from "@/components/ChatThread";
import { DataBadge } from "@/components/DataBadge";
import { MicButton } from "@/components/MicButton";
import { Ticker } from "@/components/Ticker";
import { TopBar } from "@/components/TopBar";
import { TracePanel } from "@/components/TracePanel";
import { useAgentChat } from "@/components/useAgentChat";
import { sourceLabel, thb } from "@/lib/format";
import { openReport } from "@/lib/report";
import type { Holding } from "@/lib/types";

const SUGGESTIONS = ["Buy 5,000 THB of ARB", "Is AVAX worrying?", "Does WLD have an unlock?", "Scan my portfolio"];

// The U-topia phone view: wallet + U-Bot chat, with Agent Trace and a large latest-result panel.
export default function AppPage() {
  const { messages, busy, error, setError, levels, last, ask, scan, questionFor } = useAgentChat();
  const [input, setInput] = useState("");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [totalThb, setTotalThb] = useState(0);

  useEffect(() => {
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((b) => {
        setHoldings(b.holdings ?? []);
        setTotalThb(b.totalThb ?? 0);
      })
      .catch(() => undefined);
  }, []);

  const send = (text: string) => {
    setInput("");
    ask(text);
  };
  const modes = messages.flatMap((m) => m.result?.cards.map((c) => c.source.mode) ?? []);
  const dataMode = modes.includes("live") ? "live" : modes.includes("snapshot") ? "snapshot" : "sample";

  return (
    <>
      <TopBar current="app">
        {last && (
          <span className="pill" title="Who answered the last question">
            Agent: {last.engine}
          </span>
        )}
        <DataBadge
          status={dataMode === "live" ? "LIVE" : dataMode === "snapshot" ? "CACHED" : "DEMO"}
          source={dataMode === "live" ? "Live Feed" : dataMode === "snapshot" ? "Snapshot" : "Demo Data"}
          label="Mode"
        />
      </TopBar>
      <div className="ticker-wrap">
        <Ticker onPick={(s) => send(`Check ${s} for me`)} />
      </div>

      <main className="app-grid">
        <section className="phone" aria-label="U-topia app">
          <div className="phone-status">
            <span>U-topia</span>
            <span className="mono">9:41</span>
          </div>

          <div className="wallet">
            <div className="wallet-top">
              <div>
                <div className="wallet-label">Wallet balance</div>
                <div className="wallet-total">{thb(totalThb)}</div>
              </div>
              <button className="btn btn-sm" onClick={scan} disabled={busy}>
                Scan portfolio
              </button>
            </div>
            <ul className="holdings" aria-label="Tokens in the wallet">
              {holdings.map((h) => {
                const lv = levels[h.symbol];
                const flagged = lv === "high" || lv === "medium";
                return (
                  <li key={h.symbol}>
                    <button
                      className={`holding ${lv ? `lv-${lv}` : ""}`}
                      onClick={() => send(`Check the ${h.symbol} I hold`)}
                      disabled={busy}
                      title={`${h.name}: ${h.amount.toLocaleString("en-US")} ${h.symbol}`}
                    >
                      <span className="holding-sym">
                        {flagged && <span className="dot" aria-label="Has an unlock to watch" />}
                        {h.symbol}
                      </span>
                      <span className="holding-val">{thb(h.valueThb)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="chat">
            <div className="chat-head">
              <Avatar size={30} thinking={busy} level={topLevel(Object.values(levels))} />
              <div>
                <p>U-Bot · U-Guard</p>
                <span>{busy ? "Checking…" : "Check the risk before your money moves"}</span>
              </div>
            </div>

            <ChatThread messages={messages} busy={busy} questionFor={questionFor} />

            {error && (
              <p className="error" style={{ padding: "0 14px" }}>
                {error}
              </p>
            )}
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => (s.startsWith("Scan") ? scan() : send(s))} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <label htmlFor="ask" className="sr-only">
                Ask U-Guard
              </label>
              <input
                id="ask"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Buy 5,000 THB of ARB"
                autoComplete="off"
                maxLength={500}
              />
              <MicButton onText={send} onError={setError} disabled={busy} />
              <button className="btn btn-primary" type="submit" disabled={busy || !input.trim()}>
                Send
              </button>
            </form>
          </div>
        </section>

        <aside className="side">
          {last && last.result.cards.length > 0 && (
            <section className="panel spotlight" aria-label="Latest result">
              <div className="panel-head">
                <h2>Latest result</h2>
                <span className="total">Enlarged from the chat for big screens</span>
                <button
                  className="btn btn-sm"
                  onClick={() => openReport([...messages].reverse().find((m) => m.role === "user")?.text ?? "Portfolio scan", last.result)}
                >
                  PDF
                </button>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {last.result.cards.map((c) => (
                  <RiskCardView key={c.symbol} card={c} />
                ))}
              </div>
            </section>
          )}
          <TracePanel last={last} />

          <section className="panel" aria-label="How U-Guard works">
            <div className="panel-head">
              <h2>How U-Guard works</h2>
            </div>
            <div className="steps">
              <div>
                <b>1. Fetch</b>Unlock schedule, recipients and funding rounds from Tokenomist
              </div>
              <div>
                <b>2. Score in code</b>Size, liquidity and recipient type, based on Keyrock research
              </div>
              <div>
                <b>3. You decide</b>Approve, and the rule is recorded on Avalanche
              </div>
            </div>
            <p className="note" style={{ marginTop: 10 }}>
              U-Guard doesn't predict prices or tell you to buy or sell. Every number comes from a dated source.
            </p>
          </section>
        </aside>
      </main>
    </>
  );
}
