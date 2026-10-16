"use client";

import { useState } from "react";

// Token logo: CoinGecko's image when we have it, else the free CoinCap icon CDN by ticker, else
// the ticker's letters (CoinGecko rate-limits shared IPs, so its images are not always there).
export function TokenLogo({ symbol, src, size = 22 }: { symbol: string; src?: string | null; size?: number }) {
  const sources = [src, `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`].filter(Boolean) as string[];
  const [i, setI] = useState(0);
  if (i >= sources.length) {
    return (
      <i style={{ width: size, height: size }} aria-hidden="true">
        {symbol.slice(0, 3)}
      </i>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={sources[i]} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setI((n) => n + 1)} />
  );
}
