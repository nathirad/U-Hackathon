// Runs once when the Node server starts: start the alert watcher (see src/lib/watch.ts), and with
// Tokenomist live, build the market screen in the background so the first page doesn't wait for it.
// Keep the import inside the `=== "nodejs"` block (Next's documented pattern): webpack drops
// the branch from the edge bundle. An early `return` doesn't, and `next dev` then fails to
// compile node:crypto for the edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWatcher } = await import("./lib/watch");
    startWatcher();
    if (process.env.TOKENOMIST_API_KEY?.trim()) {
      const [{ marketScreen }, { now }] = await Promise.all([import("./lib/screener"), import("./lib/config")]);
      void marketScreen(now()).catch(() => undefined);
    }
  }
}
