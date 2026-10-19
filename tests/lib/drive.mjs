// Takes a run's decisions in the page as they come, for any scenario and either mode: an option (after
// any rejections), a confirmation, every draft in the Outbox. plan: { option, reject: [ids],
// confirm: "confirm" | "reject", drafts: "approve" | "reject" | ["approve", "reject", …] }.
// Resolves with { end: the status pill's last state, decided: [what was done, in order] }.

const ENDS = ["Done", "Stopped", "Error", "Aborted"];
// A decided card can be hidden at once (the Outbox opens as soon as the agent drafts), so the waits for
// a decision's mark look for it in the page, not for it on screen.

export async function driveDecisions(page, plan = {}, { timeout = 240000 } = {}) {
  const decided = [];
  let drafts = 0;
  for (let guard = 0; guard < 30; guard++) {
    const handle = await page.waitForFunction((ends) => {
      const pill = document.querySelector(".status-pill .text")?.textContent.trim();
      if (ends.includes(pill)) return pill;
      if (document.querySelector("#panel-options .option-card .option-actions .btn")) return "options";
      if (document.querySelector("#console .confirm-actions .btn-approve")) return "confirm";
      if (document.getElementById("kpi-clock-sub")?.textContent.trim() === "paused: your approval" && document.querySelector('#panel-outbox .action-card[data-status="pending"]')) return "drafts";
      return false;
    }, ENDS, { timeout, polling: 150 });
    const what = await handle.jsonValue();
    if (ENDS.includes(what)) return { end: what, decided };
    if (what === "options") {
      for (const r of plan.reject || []) {
        await page.click(`.option-card[data-id="${r}"] .btn-reject`);
        await page.waitForSelector(`.option-card[data-id="${r}"][data-status="rejected"]`, { state: "attached", timeout: 10000 });
      }
      await page.click(plan.option === "baseline" ? '.option-card[data-id="baseline"] .option-actions .btn' : `.option-card[data-id="${plan.option}"] .btn-approve`);
      await page.waitForSelector(`.option-card[data-id="${plan.option}"][data-status="approved"]`, { state: "attached", timeout: 10000 });
      decided.push(`option ${plan.option}`);
    } else if (what === "confirm") {
      await page.click(`#console .confirm-actions ${plan.confirm === "reject" ? ".btn-reject" : ".btn-approve"}`);
      await page.waitForSelector("#console .confirm-card .option-status", { state: "attached", timeout: 10000 });
      decided.push(`confirm ${plan.confirm || "confirm"}`);
    } else if (what === "drafts") {
      const pending = await page.$$eval("#panel-outbox .action-card", (els) => els.map((e, i) => (e.dataset.status === "pending" ? i : -1)).filter((i) => i >= 0));
      for (const i of pending) {
        const choice = Array.isArray(plan.drafts) ? plan.drafts[drafts] ?? "approve" : plan.drafts || "approve";
        const card = `#panel-outbox .action-card:nth-child(${i + 1})`;
        await page.click(`${card} ${choice === "reject" ? ".btn-reject" : ".btn-approve"}`);
        await page.waitForSelector(`${card}:not([data-status="pending"])`, { state: "attached", timeout: 10000 });
        drafts += 1;
      }
      decided.push(`drafts ${pending.length}`);
    }
  }
  throw new Error(`more than 30 decisions in one run: ${decided.join(", ")}`);
}
