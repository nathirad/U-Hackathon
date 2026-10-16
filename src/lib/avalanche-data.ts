// Avalanche Data API (AvaCloud, formerly Glacier): on-chain data for an address or transaction on
// C-Chain (43114) or Fuji (43113). Read-only; it works without a key, and AVALANCHE_DATA_API_KEY
// (from build.avax.network) raises the rate limit. Every field is read defensively: the API is
// in beta, and a missing field becomes null rather than an error. When the API doesn't answer,
// the result says so; nothing is made up.

export type AvaxNetwork = "mainnet" | "fuji";

const CHAIN_ID: Record<AvaxNetwork, string> = { mainnet: "43114", fuji: "43113" };
const EXPLORER: Record<AvaxNetwork, string> = { mainnet: "https://snowtrace.io", fuji: "https://testnet.snowtrace.io" };
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export interface OnchainTransfer {
  symbol: string | null;
  amount: number | null;
  from: string | null;
  to: string | null;
}

export interface OnchainTx {
  hash: string;
  time: string | null; // ISO
  status: string | null;
  from: string | null;
  to: string | null;
  method: string | null;
  valueAvax: number | null;
  transfers: OnchainTransfer[];
  explorerUrl: string;
}

export interface WalletActivity {
  network: AvaxNetwork;
  address: string;
  native: { symbol: string; balance: number | null; valueUsd: number | null } | null;
  tokens: { symbol: string; name: string | null; contract: string | null; balance: number | null; valueUsd: number | null }[];
  transactions: OnchainTx[];
  source: "live" | "unavailable";
  note?: string;
  asOf: string;
}

function settings() {
  const env = (n: string) => (process.env[n] ?? "").trim();
  return { base: env("AVALANCHE_DATA_API_URL") || "https://data-api.avax.network", key: env("AVALANCHE_DATA_API_KEY") };
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);
const addr = (v: unknown): string | null => str(obj(v).address) ?? str(v);
/** Base units (string) → whole units, using the token's decimals. */
function units(raw: unknown, decimals: unknown): number | null {
  const s = str(raw);
  const d = Number(decimals ?? 18);
  if (s === null || !Number.isFinite(d)) return null;
  const n = Number(s) / 10 ** d;
  return Number.isFinite(n) ? n : null;
}
const money = (v: unknown): number | null => {
  const n = Number(obj(v).value);
  return Number.isFinite(n) ? n : null;
};

async function get(path: string, fetchImpl: typeof fetch): Promise<{ ok: true; body: Json } | { ok: false; status: number | null }> {
  const { base, key } = settings();
  try {
    const res = await fetchImpl(`${base}${path}`, {
      headers: { accept: "application/json", ...(key ? { "x-glacier-api-key": key } : {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, body: obj(await res.json()) };
  } catch {
    return { ok: false, status: null };
  }
}

function parseTx(t: Json, network: AvaxNetwork): OnchainTx | null {
  const n = obj(t.nativeTransaction ?? t);
  const hash = str(n.txHash);
  if (!hash) return null;
  const ts = Number(n.blockTimestamp);
  const erc20 = Array.isArray(t.erc20Transfers) ? (t.erc20Transfers as unknown[]) : [];
  return {
    hash,
    time: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null,
    status: str(n.txStatus),
    from: addr(n.from),
    to: addr(n.to),
    method: str(obj(n.method).methodName) ?? str(obj(n.method).callType),
    valueAvax: units(n.value, 18),
    transfers: erc20.slice(0, 5).map((x) => {
      const e = obj(x);
      const token = obj(e.erc20Token);
      return { symbol: str(token.symbol), amount: units(e.value, token.decimals), from: addr(e.from), to: addr(e.to) };
    }),
    explorerUrl: `${EXPLORER[network]}/tx/${hash}`,
  };
}

const cache = new Map<string, { at: number; value: WalletActivity }>();

/** Native balance, ERC-20 balances and the latest transactions of one address. */
export async function walletActivity(address: string, network: AvaxNetwork, fetchImpl: typeof fetch = fetch): Promise<WalletActivity> {
  const asOf = new Date().toISOString();
  if (!ADDRESS_RE.test(address)) return { network, address, native: null, tokens: [], transactions: [], source: "unavailable", note: "Not an EVM address (0x + 40 hex)", asOf };
  const key = `${network}:${address.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;

  const chain = CHAIN_ID[network];
  const base = `/v1/chains/${chain}/addresses/${address}`;
  const [nat, erc, txs] = await Promise.all([
    get(`${base}/balances:getNative?currency=usd`, fetchImpl),
    get(`${base}/balances:listErc20?currency=usd&pageSize=10&filterSpamTokens=true`, fetchImpl),
    get(`${base}/transactions?pageSize=10`, fetchImpl),
  ]);
  if (!nat.ok && !erc.ok && !txs.ok) {
    const status = nat.status ?? erc.status ?? txs.status;
    return {
      network,
      address,
      native: null,
      tokens: [],
      transactions: [],
      source: "unavailable",
      note: `Avalanche Data API didn't answer${status ? ` (HTTP ${status})` : " (network)"}`,
      asOf,
    };
  }
  const n = nat.ok ? obj(nat.body.nativeTokenBalance) : {};
  const value: WalletActivity = {
    network,
    address,
    native: nat.ok ? { symbol: str(n.symbol) ?? "AVAX", balance: units(n.balance, n.decimals), valueUsd: money(n.balanceValue) } : null,
    tokens: erc.ok && Array.isArray(erc.body.erc20TokenBalances)
      ? (erc.body.erc20TokenBalances as unknown[]).map((x) => {
          const t = obj(x);
          return { symbol: str(t.symbol) ?? "?", name: str(t.name), contract: str(t.address), balance: units(t.balance, t.decimals), valueUsd: money(t.balanceValue) };
        })
      : [],
    transactions: txs.ok && Array.isArray(txs.body.transactions)
      ? (txs.body.transactions as unknown[]).map((t) => parseTx(obj(t), network)).filter((t): t is OnchainTx => t !== null)
      : [],
    source: "live",
    asOf,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

export interface OnchainLookup {
  kind: "transaction" | "contract" | "unknown";
  network: AvaxNetwork;
  id: string;
  tx?: OnchainTx;
  contract?: { name: string | null; symbol: string | null; ercType: string | null; deployedBy: string | null; explorerUrl: string };
  source: "live" | "unavailable";
  note?: string;
}

/** One transaction (by hash) or one contract (by address). */
export async function lookupOnchain(id: string, network: AvaxNetwork, fetchImpl: typeof fetch = fetch): Promise<OnchainLookup> {
  const chain = CHAIN_ID[network];
  if (TX_HASH_RE.test(id)) {
    const r = await get(`/v1/chains/${chain}/transactions/${id}`, fetchImpl);
    if (!r.ok) return { kind: "transaction", network, id, source: "unavailable", note: `Avalanche Data API didn't answer${r.status ? ` (HTTP ${r.status})` : " (network)"}` };
    const tx = parseTx(r.body, network);
    return tx ? { kind: "transaction", network, id, tx, source: "live" } : { kind: "transaction", network, id, source: "live", note: "Transaction not found" };
  }
  if (ADDRESS_RE.test(id)) {
    const r = await get(`/v1/chains/${chain}/addresses/${id}`, fetchImpl);
    if (!r.ok) return { kind: "contract", network, id, source: "unavailable", note: `Avalanche Data API didn't answer${r.status ? ` (HTTP ${r.status})` : " (network)"}` };
    const b = r.body;
    return {
      kind: "contract",
      network,
      id,
      contract: {
        name: str(b.name),
        symbol: str(b.symbol),
        ercType: str(b.ercType),
        deployedBy: addr(obj(b.deploymentDetails).deployerAddress),
        explorerUrl: `${EXPLORER[network]}/address/${id}`,
      },
      source: "live",
    };
  }
  return { kind: "unknown", network, id, source: "unavailable", note: "Give a transaction hash (0x + 64 hex) or a contract address (0x + 40 hex)" };
}
