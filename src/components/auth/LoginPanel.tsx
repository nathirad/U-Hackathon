"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "../Icon";

type EthereumProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/terminal";
}

export function LoginPanel({ next, demoEnabled }: { next?: string; demoEnabled: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"signin" | "create">("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);

  useEffect(() => {
    setHasWallet(typeof window !== "undefined" && Boolean((window as unknown as { ethereum?: EthereumProvider }).ethereum));
  }, []);

  const done = () => {
    router.push(safeNext(next));
    router.refresh();
  };

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
    return data;
  }

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      done();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  const demo = () => run("demo", async () => void (await post("/api/auth/demo", {})));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run("form", async () => {
      if (tab === "signin") await post("/api/auth/login", { email, password });
      else await post("/api/auth/register", { email, name, password });
    });
  };

  const wallet = () =>
    run("wallet", async () => {
      const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
      if (!eth) throw new Error("No wallet found in this browser.");
      const [address] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const chainHex = (await eth.request({ method: "eth_chainId" })) as string;
      const { nonce } = await (await fetch("/api/auth/nonce")).json();
      const message = [
        `${window.location.host} wants you to sign in with your Ethereum account:`,
        address,
        "",
        "Sign in to U-Guard. This does not cost gas or move funds.",
        "",
        `URI: ${window.location.origin}`,
        "Version: 1",
        `Chain ID: ${parseInt(chainHex, 16)}`,
        `Nonce: ${nonce}`,
        `Issued At: ${new Date().toISOString()}`,
      ].join("\n");
      const signature = (await eth.request({ method: "personal_sign", params: [message, address] })) as string;
      await post("/api/auth/wallet", { message, signature });
    });

  return (
    <div className="card auth-card stack" style={{ gap: 16 }}>
      <div>
        <h2 style={{ fontSize: "1.5rem", marginBottom: 4 }}>Sign in to U-Guard</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Your wallet stays yours. U-Guard never asks for your seed phrase or private key.
        </p>
      </div>

      {demoEnabled ? (
        <button type="button" className="btn btn-primary btn-block" onClick={demo} disabled={busy !== null} style={{ minHeight: 50 }}>
          <Icon name="spark" /> {busy === "demo" ? "Opening demo…" : "Continue with the demo account"}
        </button>
      ) : null}

      {hasWallet ? (
        <button type="button" className="btn btn-block" onClick={wallet} disabled={busy !== null}>
          <Icon name="wallet" /> {busy === "wallet" ? "Check your wallet…" : "Sign in with your wallet"}
        </button>
      ) : null}

      <div className="divider">or use email</div>

      <div className="segmented" role="tablist" aria-label="Account" style={{ alignSelf: "flex-start" }}>
        <button type="button" role="tab" aria-selected={tab === "signin"} aria-pressed={tab === "signin"} onClick={() => setTab("signin")}>
          Sign in
        </button>
        <button type="button" role="tab" aria-selected={tab === "create"} aria-pressed={tab === "create"} onClick={() => setTab("create")}>
          Create account
        </button>
      </div>

      <form className="stack" onSubmit={submit} noValidate>
        {tab === "create" ? (
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={10}
          />
          {tab === "create" ? <span className="dim" style={{ fontSize: 12 }}>At least 10 characters, with letters and numbers.</span> : null}
        </div>
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}
        <button type="submit" className="btn btn-block" disabled={busy !== null || !email || !password}>
          {busy === "form" ? "Please wait…" : tab === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
