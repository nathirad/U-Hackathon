// Live data check: calls every outside service the way the app does and says what works.
//   npm run check:live
// Reads .env. Prints PASS / WARN / FAIL per service with the reason; never prints a key.
// WARN = optional piece missing (the app falls back and labels it); FAIL = set up but not working.

type Row = { name: string; status: "PASS" | "WARN" | "FAIL"; detail: string; ms: number };

try {
  process.loadEnvFile(".env");
} catch {
  // no .env: rely on the environment
}
process.env.LOG_SILENT = "1";

const rows: Row[] = [];
async function check(name: string, fn: () => Promise<[Row["status"], string]>) {
  const t0 = Date.now();
  try {
    const [status, detail] = await fn();
    rows.push({ name, status, detail, ms: Date.now() - t0 });
  } catch (err) {
    rows.push({ name, status: "FAIL", detail: (err as Error).message.slice(0, 160), ms: Date.now() - t0 });
  }
}
const has = (k: string) => Boolean(process.env[k]?.trim());

async function main() {
  // Imported after .env is loaded: config reads the environment once.
  const { config, now } = await import("../src/lib/config");
  const tk = await import("../src/lib/tokenomist");
  const { assessUnlockRisk } = await import("../src/lib/risk");
  const { getQuote } = await import("../src/lib/market");
  const { marketScreen } = await import("../src/lib/screener");
  const { latestHeadlines } = await import("../src/lib/intel/feeds");
  const { lookupOnchain, walletActivity } = await import("../src/lib/avalanche-data");
  const { getAvaxBalance } = await import("../src/lib/avalanche");
  const t = now();

  await check("Tokenomist · token list", async () => {
    if (!config.tokenomist.apiKey) return ["WARN", "TOKENOMIST_API_KEY not set: saved snapshot (15 Oct)"];
    const l = await tk.listTokens();
    return l.source === "live" ? ["PASS", `live · ${l.data.length} tokens`] : ["FAIL", `${l.source} · ${l.warning ?? "no live answer"}`];
  });
  await check("Tokenomist · tokens scored in full", async () => {
    const tr = await tk.trackedTokens();
    return [tr.source === "live" ? "PASS" : "WARN", `${tr.source} · ${tr.data.map((x) => x.symbol.toUpperCase()).join(", ")}`];
  });
  await check("Tokenomist · ARB unlock score", async () => {
    const r = await assessUnlockRisk("ARB", null, { now: t, locale: "en" });
    if (!r.ok) return ["FAIL", r.reason];
    const c = r.card;
    return [c.source.mode === "live" ? "PASS" : "WARN", `${c.source.mode} · ${c.level} ${c.score}/100 · ${c.timing} ${c.unlockDate?.slice(0, 10) ?? ""}`];
  });
  await check("Tokenomist · screener (next cliffs, 40 largest)", async () => {
    const s = await marketScreen(t);
    const withNext = s.rows.filter((x) => x.nextUnlock).length;
    return [s.sources.tokens === "live" ? "PASS" : "WARN", `${s.sources.tokens} · ${s.rows.length} tokens · ${withNext} with a cliff in ${s.windowDays} days`];
  });
  await check("Prices (Hyperliquid + CoinGecko)", async () => {
    if (config.market.source !== "live") return ["WARN", "MARKET_SOURCE is not live: sample prices"];
    const q = await getQuote("ARB");
    if (!q) return ["FAIL", "no ARB quote"];
    return [q.source === "live" && !q.stale ? "PASS" : "FAIL", `${q.source}${q.stale ? " (stale)" : ""} · ARB $${q.priceUsd} · 24h volume $${Math.round(q.volume24hUsd / 1e6)}M`];
  });
  await check("News (RSS)", async () => {
    if (config.intel.news === "fixture") return ["WARN", "NEWS_SOURCE=fixture: saved news"];
    const h = await latestHeadlines();
    return [h.length ? "PASS" : "FAIL", `${h.length} live headlines`];
  });
  await check("Avalanche Data API · contract lookup (WAVAX, C-Chain)", async () => {
    const r = await lookupOnchain("0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", "mainnet");
    return r.source === "live" && r.contract ? ["PASS", `${r.contract.name ?? "?"} (${r.contract.symbol ?? "?"}) · key ${has("AVALANCHE_DATA_API_KEY") ? "set" : "not set (lower rate limit)"}`] : ["FAIL", r.note ?? "no answer"];
  });
  await check("Avalanche Data API · your wallet", async () => {
    const addr = config.avalanche.walletAddress;
    if (!addr) return ["WARN", "WALLET_ADDRESS not set: the agent reads a SIWE user's wallet instead"];
    const [fuji, main] = await Promise.all([walletActivity(addr, "fuji"), walletActivity(addr, "mainnet")]);
    const line = (w: typeof fuji) => (w.source === "live" ? `${w.network}: ${w.native?.balance ?? "?"} AVAX, ${w.tokens.length} tokens, ${w.transactions.length} tx` : `${w.network}: ${w.note}`);
    return [fuji.source === "live" || main.source === "live" ? "PASS" : "FAIL", `${line(fuji)} · ${line(main)}`];
  });
  await check("Avalanche Fuji RPC (approvals)", async () => {
    const addr = config.avalanche.walletAddress || "0x0000000000000000000000000000000000000000";
    const bal = await getAvaxBalance(addr);
    const signer = config.avalanche.demoPrivateKey ? "DEMO_PRIVATE_KEY set: approvals go on-chain" : "no DEMO_PRIVATE_KEY: approvals are simulated";
    return [bal === null ? "FAIL" : config.avalanche.demoPrivateKey ? "PASS" : "WARN", `${bal === null ? "RPC didn't answer" : "RPC ok"} · ${signer}`];
  });
  await check("ElevenLabs (voice)", async () => {
    if (!has("ELEVENLABS_API_KEY")) return ["WARN", "ELEVENLABS_API_KEY not set: the browser's voice speaks instead"];
    const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return ["FAIL", `HTTP ${res.status} (check the key)`];
    const body = (await res.json()) as { voices?: { voice_id: string; name: string }[] };
    const id = process.env.ELEVENLABS_VOICE_ID?.trim();
    const voice = body.voices?.find((v) => v.voice_id === id);
    if (!id) return ["WARN", `key ok · ${body.voices?.length ?? 0} voices · set ELEVENLABS_VOICE_ID to one of them`];
    return voice ? ["PASS", `key ok · voice "${voice.name}" · model ${config.elevenlabs.modelId}`] : ["FAIL", "ELEVENLABS_VOICE_ID is not one of this account's voices"];
  });
  await check("LLM (chat answers)", async () => {
    if (has("LLM_API_KEY") && has("LLM_BASE_URL")) {
      const res = await fetch(`${process.env.LLM_BASE_URL!.replace(/\/$/, "")}/models`, { headers: { authorization: `Bearer ${process.env.LLM_API_KEY}` }, signal: AbortSignal.timeout(8000) });
      return [res.ok ? "PASS" : "FAIL", `${config.llm.label} · ${config.llm.model} · HTTP ${res.status}`];
    }
    if (has("ANTHROPIC_API_KEY")) {
      const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(8000),
      });
      return [res.ok ? "PASS" : "FAIL", `Claude · ${config.anthropic.model} · key ${res.ok ? "ok" : `HTTP ${res.status}`}`];
    }
    return ["WARN", "no ANTHROPIC_API_KEY or LLM_API_KEY: the rules engine answers (works, but fixed phrasing)"];
  });
  await check("Secrets for npm start / MCP", async () => {
    const missing = ["AUTH_SECRET", "MCP_API_KEY"].filter((k) => !has(k));
    return missing.length ? ["WARN", `not set: ${missing.join(", ")} (npm start needs AUTH_SECRET; MCP is off in production without MCP_API_KEY)`] : ["PASS", "AUTH_SECRET and MCP_API_KEY set"];
  });

  const icon = { PASS: "\x1b[32mPASS\x1b[0m", WARN: "\x1b[33mWARN\x1b[0m", FAIL: "\x1b[31mFAIL\x1b[0m" };
  const width = Math.max(...rows.map((r) => r.name.length));
  console.log("\nU-Guard live data check\n");
  for (const r of rows) console.log(`${icon[r.status]}  ${r.name.padEnd(width)}  ${r.detail}  \x1b[2m(${r.ms} ms)\x1b[0m`);
  const fails = rows.filter((r) => r.status === "FAIL").length;
  console.log(`\n${rows.length - fails}/${rows.length} without failures${fails ? ` · ${fails} FAIL` : ""}`);
  process.exit(fails ? 1 : 0);
}

main();
