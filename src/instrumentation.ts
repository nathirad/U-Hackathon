// Runs once when the Node server starts: start the alert watcher (see src/lib/watch.ts).
// Keep the import inside the `=== "nodejs"` block (Next's documented pattern): webpack drops
// the branch from the edge bundle. An early `return` doesn't, and `next dev` then fails to
// compile node:crypto for the edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { startWatcher } = require("./lib/watch");
    startWatcher();
  }
}
