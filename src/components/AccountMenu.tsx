"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Me {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  method: "demo" | "password" | "wallet";
}

const METHOD = { demo: "Demo account", password: "Email account", wallet: "Wallet (Sign-In with Ethereum)" } as const;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Who is signed in, with Sign out and a way to sign in differently (email or wallet). */
export function AccountMenu() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((b: { user?: Me | null }) => setMe(b.user ?? null))
      .catch(() => setMe(null));
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function signOut(next: string) {
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => undefined);
    window.location.assign(next);
  }

  if (me === undefined) return null;
  if (!me) {
    return (
      <Link href="/login?next=/terminal" className="btn btn-sm">
        Sign in
      </Link>
    );
  }
  const label = me.method === "wallet" && me.address ? short(me.address) : me.name;
  return (
    <div className="account" ref={box}>
      <button className="btn btn-sm account-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Account: ${label}`}>
        <span className="account-dot" aria-hidden="true">
          {(me.name || "U").slice(0, 1).toUpperCase()}
        </span>
        <span className="account-name">{label}</span>
      </button>
      {open && (
        <div className="account-pop panel" role="dialog" aria-label="Account">
          <p className="account-who">
            <b>{me.name}</b>
            <small>
              {METHOD[me.method]}
              {me.email && me.method === "password" ? ` · ${me.email}` : ""}
              {me.address ? ` · ${short(me.address)}` : ""}
            </small>
          </p>
          {me.method === "demo" && (
            <p className="note">
              {me.id === "demo-user"
                ? "Shared demo account: a sample wallet; orders and messages are shared on this server."
                : "Your own demo account in this browser: a sample wallet; your orders, plans and messages are yours."}
            </p>
          )}
          <div className="account-actions">
            <button className="btn btn-sm" onClick={() => signOut("/login?next=/terminal")}>
              Sign in another way
            </button>
            <button className="btn btn-sm" onClick={() => signOut("/")}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
