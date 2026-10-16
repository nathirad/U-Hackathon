import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { Icon } from "@/components/Icon";
import { SiteNav } from "@/components/site/SiteChrome";
import { getSession } from "@/lib/auth/session";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSession()) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/terminal");
  return (
    <>
      <SiteNav />
      <main className="auth-wrap">
        <div className="container auth-grid">
          <section className="auth-pitch">
            <span className="eyebrow">U-Bot · U-Guard skill</span>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", marginTop: 12 }}>Know before your money moves.</h1>
            <p className="muted" style={{ fontSize: "1.05rem", maxWidth: "34em" }}>
              Ask U-Bot before you buy. U-Guard checks the token&apos;s unlock schedule, the news and what markets are pricing, then
              explains it in plain words.
            </p>
            <ul>
              <li>
                <Icon name="check" /> Risk scores computed in code from Tokenomist data, never guessed by the AI
              </li>
              <li>
                <Icon name="check" /> Every number traced to a source, with live, snapshot or sample labels
              </li>
              <li>
                <Icon name="check" /> You approve every protection rule; the decision is recorded on Avalanche
              </li>
            </ul>
          </section>
          <LoginPanel next={next} demoEnabled={config.auth.demoLogin} />
        </div>
      </main>
    </>
  );
}
