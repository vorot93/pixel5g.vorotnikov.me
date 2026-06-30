import { $, component$, useSignal, useStore } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import type { AdbSession } from "~/lib/adb";
import { installModule } from "~/lib/device";
import { prepareModule, PreconditionError, type PreparedModule } from "~/lib/wizard";
import * as engine from "~/lib/engine";
import { StepRow, type StepState } from "~/components/step-row";
import { LogPanel } from "~/components/log-panel";

interface State {
  steps: StepState[];          // [connect, detect, read, build, install]
  detail: string[];
  log: string[];
  ready: boolean;              // module built, awaiting install confirm
  done: boolean;
}
const STEP_TITLES = ["Connect device", "Detect model", "Read carrier-config", "Build patch module", "Install & reboot"];

export default component$(() => {
  const store = useStore<State>({ steps: ["idle", "idle", "idle", "idle", "idle"], detail: ["", "", "", "", ""], log: [], ready: false, done: false });
  const session = useSignal<AdbSession | undefined>(undefined);
  const prepared = useSignal<PreparedModule | undefined>(undefined);
  const supported = useSignal(true);
  const busy = useSignal(false);

  const append = $((m: string) => { store.log = [...store.log, m]; });
  const setStep = $((i: number, s: StepState, d?: string) => { store.steps = store.steps.map((x, j) => (j === i ? s : x)); if (d !== undefined) store.detail = store.detail.map((x, j) => (j === i ? d : x)); });

  // Steps 1–4: connect, then prepare the module (detect→read→build). No device mutation.
  const run = $(async () => {
    if (busy.value) return;            // guard against double-click launching two pickers
    busy.value = true;
    try {
      const { connect, isWebUsbAvailable } = await import("~/lib/adb");
      if (!isWebUsbAvailable()) { supported.value = false; return; }
      store.log = []; store.ready = false; store.done = false;
      try {
        await setStep(0, "running");
        const s = await connect();
        session.value = s;
        await setStep(0, "done"); await append("Connected.");
        await engine.initEngine();
        await setStep(1, "running"); await setStep(2, "running");
        const res = await prepareModule(s, engine, (m) => { store.log = [...store.log, m]; });
        await setStep(1, "done", res.model.display); await setStep(2, "done", res.included.join(", "));
        await setStep(3, "done", res.skipped ? `${res.skipped} combo(s) dropped` : "ready");
        prepared.value = res; store.ready = true; await setStep(4, "active");
      } catch (e) {
        // Reset EVERY in-flight step to "error" (steps 1 & 2 both run before the single
        // prepareModule call), not just the first — else a step is left stuck "running".
        const msg = e instanceof Error ? e.message : String(e);
        store.steps = store.steps.map((s) => (s === "running" ? "error" : s)) as StepState[];
        const first = store.steps.indexOf("error");
        if (first >= 0) store.detail = store.detail.map((d, j) => (j === first ? msg : d));
        await append((e instanceof PreconditionError ? "" : "error: ") + msg);
      }
    } finally {
      busy.value = false;
    }
  });

  // Step 5: the only device-mutating action — explicit confirm.
  const install = $(async () => {
    const s = session.value, p = prepared.value; if (!s || !p) return;
    try {
      await setStep(4, "running");
      await append("Installing module…");
      const out = await installModule(s, p.zip);
      await append(out.trim());
      await append("Rebooting…"); await s.reboot();
      await setStep(4, "done"); store.done = true; store.ready = false;
    } catch (e) { await setStep(4, "error", e instanceof Error ? e.message : String(e)); await append("error: " + (e instanceof Error ? e.message : String(e))); }
  });

  // Reset to the initial state so the user can retry after an error or completion.
  const reset = $(() => {
    store.steps = ["idle", "idle", "idle", "idle", "idle"];
    store.detail = ["", "", "", "", ""];
    store.log = []; store.ready = false; store.done = false;
    session.value = undefined; prepared.value = undefined; supported.value = true;
  });

  return (
    <main class="mx-auto max-w-2xl p-6">
      <h1 class="text-2xl font-bold">Pixel 5G provisioner</h1>
      <p class="mt-1 text-sm text-gray-600">Applies the APAC_COMMON LTE/5G-NR capability patches to a rooted Pixel 9/10 as a systemless Magisk module. Everything runs in your browser — nothing is uploaded.</p>
      {!supported.value && (
        <p class="mt-4 rounded bg-red-100 p-3 text-sm text-red-800">WebUSB is unavailable. Use Chrome or Edge on desktop.</p>
      )}
      <div class="mt-6 space-y-2">
        {STEP_TITLES.map((t, i) => (
          <StepRow key={i} n={i + 1} title={t} state={store.steps[i]!} detail={store.detail[i]}>
            {i === 0 && store.steps[0] === "idle" && (
              <button class="rounded bg-blue-600 px-3 py-1 text-sm text-white" onClick$={run}>Connect</button>
            )}
            {i === 4 && store.ready && (
              <button class="rounded bg-red-600 px-3 py-1 text-sm text-white" onClick$={install}>Install &amp; reboot</button>
            )}
          </StepRow>
        ))}
      </div>
      {store.ready && (
        <p class="mt-4 rounded bg-amber-100 p-3 text-xs text-amber-900">
          Review above, then confirm. Installing overlays <code>/vendor/firmware/uecapconfig</code> via a systemless Magisk module — fully reversible by disabling/removing the module in Magisk. Editing carrier configs can affect service; proceed at your own risk.
        </p>
      )}
      {store.done && <p class="mt-4 rounded bg-green-100 p-3 text-sm text-green-800">Done. The device is rebooting; verify your bands after it comes back up.</p>}
      {(store.done || store.steps.some((s) => s === "error")) && (
        <button class="mt-4 rounded border px-3 py-1 text-sm" onClick$={reset}>Start over</button>
      )}
      <LogPanel lines={store.log} />
    </main>
  );
});

export const head: DocumentHead = { title: "Pixel 5G provisioner" };
