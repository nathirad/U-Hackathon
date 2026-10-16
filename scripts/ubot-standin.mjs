// U-Bot stand-in: a real MCP client that calls U-Guard the way U-Bot would before it moves a
// user's money. U-Bot's own interface isn't public yet, so this plays its part on stage.
//
//   npm run ubot                                  # English, ARB, ฿5,000, Enter between steps
//   npm run ubot -- --symbol AVAX --thb 2000      # another token
//   npm run ubot -- --auto                        # no pauses (rehearsal, video)
//   npm run ubot -- --trade                       # also draft a paper-trade plan for the user to approve
//   npm run ubot -- --coingecko                   # U-Bot also asks CoinGecko's MCP server for 24h volume
//                                                 # (public keyless server, shared rate limit; --coingecko-url to change)
//   npm run ubot -- --url https://<host>/api/mcp  # a deployed server
//
// Reads MCP_API_KEY from .env (the server must use the same key). With the key, U-Bot acts for
// the user in --user (default demo-user): the proposal it creates lands in that user's U-Bot
// inbox (the bell in the app), where they approve it. Without the key the server treats us as
// an anonymous client and nothing reaches a user.

import readline from "node:readline/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env: rely on the environment
}

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const url = opt("url", process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}/api/mcp`);
const user = opt("user", "demo-user");
const symbol = opt("symbol", "ARB").toUpperCase();
const thb = Number(opt("thb", "5000"));
const lang = opt("lang", "en");
const auto = args.includes("--auto");
const trade = args.includes("--trade");
const coingecko = args.includes("--coingecko");
const coingeckoUrl = opt("coingecko-url", "https://mcp.api.coingecko.com/mcp");
// Ticker → CoinGecko id (same table as src/lib/market.ts).
const CG_IDS = { ARB: "arbitrum", WLD: "worldcoin-wld", AVAX: "avalanche-2", BTC: "bitcoin", ETH: "ethereum", USDC: "usd-coin", USDT: "tether" };
const key = process.env.MCP_API_KEY;

const c = { dim: "\x1b[2m", bold: "\x1b[1m", teal: "\x1b[36m", amber: "\x1b[33m", red: "\x1b[31m", green: "\x1b[32m", off: "\x1b[0m" };
const LEVEL_COLOR = { high: c.red, medium: c.amber, low: c.green, none: c.dim };
const rl = auto ? null : readline.createInterface({ input: process.stdin, output: process.stdout });

async function step(title) {
  console.log(`\n${c.bold}${title}${c.off}`);
  if (rl) await rl.question(`${c.dim}  (Enter)${c.off}`);
}
function sent(method, params, to = "U-Guard") {
  console.log(`${c.teal}  U-Bot → ${to}${c.off}  ${method}${params ? ` ${c.dim}${JSON.stringify(params)}${c.off}` : ""}`);
}
function parse(result) {
  try {
    return JSON.parse(result.content?.[0]?.text ?? "{}");
  } catch {
    return {};
  }
}

/**
 * U-Bot talks to more than one MCP server: here CoinGecko's, for live 24h volume, set against the
 * unlock size U-Guard reported. CoinGecko's tool names come from its API, so we look them up at
 * runtime (direct tools, or the dynamic invoke_api_endpoint mode) instead of hard-coding them.
 */
async function crossCheckVolume(risk) {
  const id = CG_IDS[symbol] ?? symbol.toLowerCase();
  const cg = new Client({ name: "u-bot-standin", version: "1.0.0" });
  try {
    sent(`initialize (${coingeckoUrl})`, undefined, "CoinGecko");
    await cg.connect(new StreamableHTTPClientTransport(new URL(coingeckoUrl)));
    const { tools: cgTools } = await cg.listTools();
    const priceArgs = { ids: id, vs_currencies: "usd", include_24hr_vol: true, include_market_cap: true };
    const direct = cgTools.find((t) => t.name === "get_simple_price") ?? cgTools.find((t) => /simple.*price/i.test(t.name));
    const call = direct
      ? { name: direct.name, arguments: priceArgs }
      : cgTools.some((t) => t.name === "invoke_api_endpoint")
        ? { name: "invoke_api_endpoint", arguments: { endpoint_name: "get_simple_price", args: priceArgs } }
        : null;
    if (!call) throw new Error(`no price tool among ${cgTools.length} tools`);
    sent(`tools/call ${call.name}`, call.arguments, "CoinGecko");
    const res = await cg.callTool(call);
    const text = res.content?.find((x) => x.type === "text")?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{")));
    const row = json[id] ?? json.data?.[id];
    const vol = Number(row?.usd_24h_vol);
    if (!(vol > 0)) throw new Error("no 24h volume in the answer");
    console.log(`  ← CoinGecko: ${symbol} $${row.usd} · 24h volume $${(vol / 1e6).toFixed(1)}M`);
    if (risk.unlock_value_usd > 0) {
      const share = (risk.unlock_value_usd / vol) * 100;
      console.log(`     the unlock (~$${(risk.unlock_value_usd / 1e6).toFixed(1)}M) is ${share.toFixed(0)}% of one day's volume (U-Guard's own figure: ${risk.days_of_volume ?? "–"} days)`);
    }
  } catch (err) {
    console.log(`  ${c.amber}CoinGecko MCP didn't answer (${err.message}).${c.off} U-Guard's own figure: ${risk.days_of_volume ?? "–"} days of volume.`);
  } finally {
    await cg.close().catch(() => undefined);
  }
}

console.log(`${c.bold}U-Bot (stand-in) · MCP client${c.off}`);
console.log(`${c.dim}  server ${url}\n  acting for ${key ? user : "nobody (no MCP_API_KEY: anonymous client)"}${c.off}`);
console.log(`\n  Scenario: the user asks U-Bot to buy ${symbol} for ฿${thb.toLocaleString("en-US")}. Before any money moves, U-Bot asks U-Guard.`);

const headers = { "x-uguard-locale": lang };
if (key) {
  headers.authorization = `Bearer ${key}`;
  headers["x-uguard-user"] = user;
}
const client = new Client({ name: "u-bot-standin", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });

try {
  await step("1 · Connect over MCP");
  sent("initialize");
  await client.connect(transport);
  const info = client.getServerVersion();
  console.log(`  ← connected to ${c.bold}${info?.name} ${info?.version}${c.off}`);

  await step("2 · What can U-Guard do?");
  sent("tools/list");
  const { tools } = await client.listTools();
  console.log(`  ← ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);

  await step(`3 · Check ${symbol} before buying`);
  const assessArgs = { symbol, trade_amount_thb: thb };
  sent("tools/call assess_unlock_risk", assessArgs);
  const risk = parse(await client.callTool({ name: "assess_unlock_risk", arguments: assessArgs }));
  if (risk.rated === false) {
    console.log(`  ← ${risk.note}`);
  } else {
    const color = LEVEL_COLOR[risk.level] ?? "";
    console.log(`  ← ${color}${c.bold}${String(risk.level).toUpperCase()} ${risk.score}/100${c.off}  (${risk.timing}${risk.unlock_date ? `, ${risk.unlock_date}` : ""})`);
    for (const r of (risk.reasons ?? []).slice(0, 3)) console.log(`     · ${r}`);
    console.log(`     ${c.dim}data: Tokenomist ${risk.data}${c.off}`);
  }

  if (coingecko) {
    await step(`3b · Cross-check ${symbol}'s trading volume with CoinGecko's MCP server`);
    await crossCheckVolume(risk);
  }

  if (risk.level === "high" || risk.level === "medium") {
    await step("4 · Propose a protection rule (the user decides)");
    const proposeArgs = { symbol, action: "pause_buying" };
    sent("tools/call propose_protection", proposeArgs);
    const proposal = parse(await client.callTool({ name: "propose_protection", arguments: proposeArgs }));
    if (proposal.created) {
      console.log(`  ← proposal ${c.bold}${proposal.title}${c.off}`);
      console.log(`     ${c.dim}id ${proposal.proposal_id} · status ${proposal.status}${c.off}`);
      console.log(
        key
          ? `\n  ${c.green}Delivered to ${user}'s U-Bot inbox.${c.off} Open the app → bell → "Approve" → receipt on Avalanche.`
          : `\n  ${c.amber}No MCP_API_KEY: the proposal belongs to an anonymous client and reaches no user.${c.off}`,
      );
    } else {
      console.log(`  ← not created: ${proposal.note ?? "unknown reason"}`);
    }
  } else {
    console.log(`\n  ${c.green}Nothing to protect: U-Bot can go ahead.${c.off} (Calm when it's safe: no alert, no proposal.)`);
  }

  if (trade) {
    await step(`5 · Draft the ${symbol} buy as a plan (the user approves it in the app)`);
    const planArgs = { symbol, side: "buy", amount_thb: thb, order_type: "market", limit_price_usd: null, stop_loss_pct: null, risk_budget_pct: null };
    sent("tools/call draft_trade_plan", planArgs);
    const plan = parse(await client.callTool({ name: "draft_trade_plan", arguments: planArgs }));
    if (plan.created) {
      const color = plan.verdict === "blocked" ? c.red : plan.verdict === "caution" ? c.amber : c.green;
      console.log(`  ← ${color}${c.bold}${String(plan.verdict).toUpperCase()}${c.off}  ${plan.summary?.[0] ?? ""}`);
      for (const ch of (plan.checks ?? []).filter((x) => x.status !== "ok")) console.log(`     ! ${ch.label}`);
      console.log(`     ${c.dim}plan ${plan.plan_id} · ${plan.status} · ${plan.note}${c.off}`);
      console.log(key ? `\n  ${c.green}Waiting on ${user}'s Trade page.${c.off} Nothing is bought until they approve.` : "");
    } else {
      console.log(`  ← no plan: ${plan.note ?? "unknown reason"}`);
    }
  }
  console.log(`\n${c.dim}Information only, not investment advice. Every action waits for the user's approval.${c.off}`);
} catch (err) {
  console.error(`\n${c.red}MCP call failed:${c.off} ${err.message}`);
  if (/401/.test(err.message)) console.error("  The server and this script need the same MCP_API_KEY.");
  if (/503/.test(err.message)) console.error("  The server runs in production without MCP_API_KEY, so MCP is off. Set it and restart.");
  if (/ECONNREFUSED|fetch failed/.test(err.message)) console.error(`  Is the app running at ${url}?`);
  process.exitCode = 1;
} finally {
  rl?.close();
  await client.close().catch(() => undefined);
}
