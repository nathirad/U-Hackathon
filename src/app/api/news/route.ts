import { config, now } from "@/lib/config";
import { readFixture } from "@/lib/fixtures";
import { latestHeadlines } from "@/lib/intel/feeds";
import type { NewsItem } from "@/lib/types";
import { marketUnlocks } from "@/lib/unlock-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// News page: live headlines (RSS) next to U-Guard's curated unlock reports and the unlock watch list.
export async function GET() {
  const [live, curated, unlocks] = await Promise.all([
    config.intel.news === "fixture" ? Promise.resolve([] as NewsItem[]) : latestHeadlines(),
    readFixture<{ asOf: string; mode?: string; items: NewsItem[] }>("news.json"),
    marketUnlocks(now(), { days: 30 }),
  ]);
  return Response.json({
    live,
    curated: [...(curated?.items ?? [])].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    unlocks: unlocks.upcoming,
    sources: {
      live: live.length ? "Cointelegraph · CoinDesk · Decrypt (RSS)" : null,
      curatedAsOf: curated?.asOf ?? null,
      unlocks: { mode: unlocks.source, asOf: unlocks.asOf },
    },
  });
}
