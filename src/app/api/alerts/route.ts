import { getSession } from "@/lib/auth/session";
import { LIMITS, rateLimit } from "@/lib/guard/rate-limit";
import { checkOrigin, checkPost, jsonError, tooMany } from "@/lib/http";
import { thb } from "@/lib/format";
import { AlertRuleInput, addAlertRule } from "@/lib/alert-rules";
import { store } from "@/lib/store";
import { withStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Smart alert rules (demo: kept in memory) and the protection decisions made so far, for the
// signed-in user only.
async function handleGET() {
  const session = await getSession();
  if (!session) return jsonError(401, "Sign in to see your alerts.");
  return Response.json({
    rules: store.alerts.filter((r) => r.ownerId === session.sub),
    decisions: [
      ...[...store.proposals.values()]
        .filter((r) => r.ownerId === session.sub && r.proposal.status !== "pending")
        .map((r) => ({ ...r.proposal, receipt: r.receipt ?? null })),
      // Trade and invest plans the user decided on, in the same list.
      ...[...store.tradePlans.values()]
        .filter((r) => r.ownerId === session.sub && r.plan.status !== "pending")
        .map(({ plan }) => ({ id: plan.id, symbol: plan.symbol, title: `${plan.side === "buy" ? "Buy" : "Sell"} plan ${thb(plan.amountThb)} (paper)`, status: plan.status })),
      ...[...store.investPlans.values()]
        .filter((r) => r.ownerId === session.sub && r.plan.status !== "pending")
        .map(({ plan }) => ({ id: plan.id, symbol: "Portfolio", title: `"${plan.profileName}" investment plan · DCA ${thb(plan.monthlyThb)}/month`, status: plan.status })),
    ],
  });
}

async function handlePOST(req: Request) {
  const blocked = checkPost(req);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "Sign in to add alerts.");
  const limit = rateLimit(`alerts:${session.sub}`, LIMITS.alerts.max, LIMITS.alerts.windowMs);
  if (!limit.ok) return tooMany(limit);
  // type: unlock · drift · news; symbol "*" = every non-stablecoin holding.
  const parsed = AlertRuleInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "symbol, minLevel, daysBefore (1-30) and channel are required");
  // Adding a rule that already exists just returns it.
  const { rule, created } = addAlertRule(session.sub, parsed.data);
  return Response.json(rule, { status: created ? 201 : 200 });
}

async function handleDELETE(req: Request) {
  const blocked = checkOrigin(req);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "Sign in to remove alerts.");
  const id = new URL(req.url).searchParams.get("id");
  const i = store.alerts.findIndex((r) => r.id === id && r.ownerId === session.sub);
  if (i < 0) return jsonError(404, "not found");
  store.alerts.splice(i, 1);
  return new Response(null, { status: 204 });
}

export const GET = withStore(handleGET);
export const POST = withStore(handlePOST);
export const DELETE = withStore(handleDELETE);
