// What the person decides, as a producer sees it (the live agent and the scripted replay alike): option
// decisions, draft approvals and confirmations arrive as run events from the interface (js/ui.js), are
// queued from the start of the run so none is lost while the producer is busy, and are taken by the
// tools that wait for them (js/tools.js). A run that ends (Abort, Reset, an error) rejects every wait at
// once, so nothing is left hanging.

export const ABORT = Symbol("abort");

/** bus: the run-event bus; isEnded() → true once the run has ended (late events are ignored then). */
export function createHumanChannel(bus, { isEnded = () => false } = {}) {
  const options = [];        // option_decision envelopes, oldest first
  const confirmations = [];  // confirmation_decision envelopes
  const drafts = new Map();  // action_id → { status: "pending" | "approved" | "rejected", type, recipient, subject }
  const waiters = new Set(); // reject functions of every open wait
  const checks = new Set();  // re-check functions of every open wait
  let cancelled = false;

  const poke = () => { for (const c of [...checks]) c(); };
  const offs = [
    bus.on("option_decision", (ev) => { if (isEnded()) return; options.push(ev); poke(); }),
    bus.on("action_decision", (ev) => {
      if (isEnded()) return;
      const d = drafts.get(ev.payload.action_id);
      if (d && d.status === "pending") d.status = ev.payload.decision === "approved" ? "approved" : "rejected";
      poke();
    }),
    bus.on("confirmation_decision", (ev) => { if (isEnded()) return; confirmations.push(ev); poke(); })
  ];

  /** Resolves with the first truthy value of test(), re-checked whenever the person decides something. */
  function waitUntil(test) {
    if (cancelled) return Promise.reject(ABORT);
    const now = test();
    if (now) return Promise.resolve(now);
    return new Promise((resolve, reject) => {
      const check = () => {
        const v = test();
        if (!v) return;
        checks.delete(check);
        waiters.delete(reject);
        resolve(v);
      };
      checks.add(check);
      waiters.add(reject);
    });
  }

  /** A promise that also rejects when the run is cancelled (the wait for the next wake-up, say). */
  function guard(promise) {
    if (cancelled) return Promise.reject(ABORT);
    return new Promise((resolve, reject) => {
      waiters.add(reject);
      promise.then((v) => { waiters.delete(reject); resolve(v); }, (e) => { waiters.delete(reject); reject(e); });
    });
  }

  const take = (list, pred) => {
    const i = list.findIndex((ev) => pred(ev));
    return i >= 0 ? list.splice(i, 1)[0] : null;
  };

  return {
    drafts,
    waitUntil,
    guard,
    /** Takes the oldest queued option decision that matches, or null. */
    takeOptionDecision: (pred = () => true) => take(options, pred),
    /** Takes the oldest queued confirmation that matches, or null. */
    takeConfirmation: (pred = () => true) => take(confirmations, pred),
    /** Rejects every open wait (Abort, Reset, an error). */
    cancel() {
      cancelled = true;
      for (const r of [...waiters]) r(ABORT);
      waiters.clear();
      checks.clear();
    },
    /** Stops listening (the run is over). */
    close() { offs.forEach((off) => off()); }
  };
}
