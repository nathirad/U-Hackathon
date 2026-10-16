# Other MCP servers: what fits where

U-Guard is an MCP **server** (`/api/mcp`, 25 tools). U-Bot is the orchestrator: it can talk to several MCP servers at once. This page covers four that came up (CoinGecko, EVM, Alpaca, Coinrule), where each fits, and what we left out on purpose.

**The rule behind every choice:** money only moves after the user approves in the U-Guard app. MCP tools may read and draft; none of them approves or places an order. MCP tool annotations (`readOnlyHint`, `destructiveHint`) are hints a client may ignore, so the rule is enforced on our server, not left to the model.

| Server | What it gives | Where it fits | Status |
|---|---|---|---|
| **CoinGecko MCP** (official) | Prices, 24h volume, market cap, OHLCV, DEX pools | U-Bot side: the stand-in cross-checks volume with `--coingecko` | Optional, opt-in |
| **Alpaca** (Trading API, paper) | Paper orders for crypto and US stocks | `BROKER=alpaca-paper`: after the user approves, our server sends a paper order | Optional, opt-in |
| **EVM MCP server** (`@mcpdotdirect/evm-mcp-server`) | Balances, contract reads, gas estimates, receipts; transfers with a key | The team's own dev tool, read-only | Not in the app |
| **Coinrule MCP** | Automated trading rules on real exchanges | None: it trades real money on its own | Not used |

## CoinGecko MCP

- **Endpoints:**
  - `https://mcp.api.coingecko.com/mcp` is public and keyless (Streamable HTTP; `/sse` is the fallback). It's a beta with a rate limit shared by everyone.
  - `https://mcp.pro-api.coingecko.com` needs a Demo or Pro key. It has higher limits and the full tool set (76+ tools).
- **In the demo:** `npm run ubot -- --coingecko` adds step 3b.
  - U-Bot asks CoinGecko for the token's 24h volume and sets it against the unlock size U-Guard reported (for example "the unlock is 10% of one day's volume").
  - CoinGecko's tool names come from its API, so the stand-in looks them up at runtime: a direct `get_simple_price`-style tool, or the dynamic `invoke_api_endpoint` mode.
  - If CoinGecko doesn't answer, the step says so and shows U-Guard's own figure. Use `--coingecko-url` for another endpoint.
- **Why the risk score doesn't call it:** the scorer needs the same answer every time, with a cache and a fallback. `src/lib/market.ts` already gets prices from Hyperliquid and volume from CoinGecko's REST API, cached, with dated fixtures behind them. An extra MCP hop adds one more thing that can fail on stage and gives the same numbers.

## Alpaca paper broker (`BROKER=alpaca-paper`)

- **What happens:** when the user taps **Approve** on a trade plan, `decideTradePlan()` records the approval on Avalanche Fuji as before. Then `src/lib/broker.ts` sends the order to the Alpaca **paper** account:
  - `POST https://paper-api.alpaca.markets/v2/orders`
  - `symbol: ARB/USD`, `type: market`, `time_in_force: gtc`
  - Buys are sized in USD (`notional`), sells in coin quantity (`qty`).
  - `client_order_id` = the plan id, so a double approval can't place two orders.
- **Safety:**
  - The URL is hard-coded to paper; there is no setting for live trading.
  - No agent tool and no MCP tool can reach this code. Only the user's approval behind their own session does.
  - Drafting a plan over MCP sends nothing; the evals check that.
- **Coins:** BTC, ETH, AVAX, ARB, SOL, LINK, UNI, AAVE, DOGE, LTC, BCH, DOT. Others (such as WLD) stay local paper orders with a note.
- **Failures:** no keys, an Alpaca error or no answer all keep the local paper order and say why on the Trade page ("kept as a local paper order").
- **Setup:** create a free paper account at alpaca.markets, then set `BROKER=alpaca-paper`, `ALPACA_API_KEY` and `ALPACA_SECRET_KEY`.
- **Why not Alpaca's own MCP server:** it gives the model order tools that execute directly, which is exactly what U-Guard is built to prevent.
- **Real money:** trading for Thai users has to go through a platform licensed by the Thai SEC (for example a U-topia swap through U-Bot). That is a partnership, not a setting.

## Avalanche Data API (in the app)

On-chain data comes from the Avalanche Data API (`src/lib/avalanche-data.ts`, base `https://data-api.avax.network`), not an MCP server:
- `get_wallet_activity`: AVAX balance, ERC-20 balances and the latest transactions of the user's wallet. That is the Sign-In with Ethereum address, else `WALLET_ADDRESS`, else the approvals signer.
- `lookup_onchain`: one transaction by hash, or a contract's name, symbol and standard.
- It's read-only and works without a key. `AVALANCHE_DATA_API_KEY` raises the rate limit.
- When it doesn't answer, the reply says so; nothing is filled in.

## EVM MCP server (dev only, read-only)

Useful for the team while building: check a Fuji receipt, a wallet balance or a contract read from Claude without writing code. Keep it out of the product:

- **Don't give it a private key or mnemonic.** Its write tools sign with a key from the environment. Without one, it stays read-only.
- **Use testnets** (Fuji), and pin a version you have reviewed. `npx` runs whatever the latest npm release is.
- **The app doesn't need it:** U-Guard already uses `viem` directly for the Fuji approval memo and the AVAX balance.

Example `.mcp.json` for a developer's Claude Code (keep it local, don't commit keys):

```json
{
  "mcpServers": {
    "u-guard": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer ${MCP_API_KEY}", "X-UGuard-User": "demo-user" }
    },
    "coingecko": { "type": "http", "url": "https://mcp.api.coingecko.com/mcp" },
    "evm-readonly": { "command": "npx", "args": ["-y", "@mcpdotdirect/evm-mcp-server"] }
  }
}
```

## Coinrule MCP

Not used. It runs trading rules on real exchange accounts (Binance, OKX and others) and executes on its own. That needs exchange keys, moves real money without a per-trade approval, and raises licensing questions in Thailand. U-Guard's own `create_alert_rule` and `propose_protection` cover the "tell me when ARB drops around the unlock" part, and the user still decides.
