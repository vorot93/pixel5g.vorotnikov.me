import type { AdbSession } from "./adb";
import { detectSku, probeRoot, listConfigDir, pullFile } from "./device";

/** A user-actionable precondition failure (unrooted, unknown model, missing files…). */
export class PreconditionError extends Error {}

/** The slice of engine.ts prepareModule needs — injected so it is testable without wasm. */
export interface EngineFacade {
  CARRIER: string;
  detectModel(sku: string): { code: string; display: string; lteId: bigint; nrAnchor: bigint } | undefined;
  chooseFiles(code: string, carrier: string, available: string[]): { toPull: string[]; errors: string[] };
  loadPatches(): Promise<{ nr: string; lte: string }>;
  buildModule(code: string, carrier: string, files: { name: string; bytes: Uint8Array }[], patches: { nr: string; lte: string }):
    { zip: Uint8Array; included: string[]; warnings: string[]; skipped: number };
}

export interface PreparedModule {
  model: { code: string; display: string };
  zip: Uint8Array;
  included: string[];
  warnings: string[];
  skipped: number;
}

/** Steps 2–4: detect → probe root → read config → build the module. Pure over its inputs.
 *  `log` receives human-readable progress lines. Throws PreconditionError on a user-fixable stop. */
export async function prepareModule(s: AdbSession, engine: EngineFacade, log: (m: string) => void): Promise<PreparedModule> {
  // Step 2 — detect + root
  const sku = await detectSku(s);
  const model = engine.detectModel(sku);
  if (!model) throw new PreconditionError(`Unsupported device: SKU "${sku}" is not a known Pixel 9/10.`);
  log(`Detected ${model.display} (${model.code}).`);
  if (!(await probeRoot(s))) throw new PreconditionError("This device is not rooted (Magisk). Root it first, then retry.");
  log("Root confirmed.");

  // Step 3 — read + select + pull
  const names = await listConfigDir(s);
  const sel = engine.chooseFiles(model.code, engine.CARRIER, names);
  if (sel.errors.length) throw new PreconditionError(`Cannot select config files: ${sel.errors.join("; ")}`);
  if (!sel.toPull.length) throw new PreconditionError("No carrier-config files selected for this model/carrier.");
  log(`Pulling ${sel.toPull.join(", ")}…`);
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (const name of sel.toPull) files.push({ name, bytes: await pullFile(s, name) });

  // Step 4 — build (WASM)
  const patches = await engine.loadPatches();
  const r = engine.buildModule(model.code, engine.CARRIER, files, patches);
  log(`Built module: ${r.included.join(", ")}${r.skipped ? ` (${r.skipped} combo(s) dropped for this model)` : ""}.`);
  for (const w of r.warnings) log(`warning: ${w}`);
  return { model: { code: model.code, display: model.display }, zip: r.zip, included: r.included, warnings: r.warnings, skipped: r.skipped };
}
