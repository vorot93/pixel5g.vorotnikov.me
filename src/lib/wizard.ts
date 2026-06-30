import type { AdbSession } from "./adb";
import { detectSku, probeRoot, listConfigDir, pullFile } from "./device";

/** A user-actionable precondition failure (unrooted, unknown model, missing files…). */
export class PreconditionError extends Error {}

/** The slice of engine.ts the prepare/build steps need — injected so they are testable without wasm. */
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

/** The detect→pull result: the chosen model and the carrier-config bytes pulled off the device. */
export interface PreparedInputs {
  model: { code: string; display: string };
  files: { name: string; bytes: Uint8Array }[];
}

/** Steps 2–3: detect → probe root → read config → pull files. No build, no WASM.
 *  Split out from the build so the UI can show step 4 ("Build") entering its own running state.
 *  `log` receives human-readable progress lines. Throws PreconditionError on a user-fixable stop. */
export async function prepareInputs(s: AdbSession, engine: EngineFacade, log: (m: string) => void): Promise<PreparedInputs> {
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

  return { model: { code: model.code, display: model.display }, files };
}

/** Step 4: load patches + build the Magisk module (WASM) from already-pulled inputs. */
export async function buildPrepared(engine: EngineFacade, inputs: PreparedInputs, log: (m: string) => void): Promise<PreparedModule> {
  const patches = await engine.loadPatches();
  const r = engine.buildModule(inputs.model.code, engine.CARRIER, inputs.files, patches);
  log(`Built module: ${r.included.join(", ")}${r.skipped ? ` (${r.skipped} combo(s) dropped for this model)` : ""}.`);
  for (const w of r.warnings) log(`warning: ${w}`);
  return { model: inputs.model, zip: r.zip, included: r.included, warnings: r.warnings, skipped: r.skipped };
}
