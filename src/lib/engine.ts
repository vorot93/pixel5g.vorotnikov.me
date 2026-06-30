import init, { deviceModel, selectFiles, Provisioner } from "./engine-pkg/engine.js";

export const CARRIER = "APAC_COMMON";

let ready: Promise<void> | undefined;

/** Initialise the wasm module exactly once. */
export async function initEngine(): Promise<void> {
  if (!ready) ready = init().then(() => undefined);
  return ready;
}

/** Precondition: initEngine() must have been awaited. */
export function detectModel(sku: string) {
  const m = deviceModel(sku);
  if (!m) return undefined;
  const out = { code: m.code, display: m.display, lteId: m.lteId, nrAnchor: m.nrAnchor };
  m.free();
  return out;
}

/** Precondition: initEngine() must have been awaited. */
export function chooseFiles(code: string, carrier: string, available: string[]) {
  const sel = selectFiles(code, carrier, available);
  const out = { toPull: sel.toPull, errors: sel.errors };
  sel.free();
  return out;
}

/** Fetch the two bundled patch TOMLs (served as static assets). */
export async function loadPatches(): Promise<{ nr: string; lte: string }> {
  const base = import.meta.env.BASE_URL;
  const get = async (name: string) => {
    const res = await fetch(`${base}patches/${name}`);
    if (!res.ok) throw new Error(`failed to load ${name}: ${res.status}`);
    return res.text();
  };
  const [nr, lte] = await Promise.all([get("nr_patch.toml"), get("lte_patch.toml")]);
  return { nr, lte };
}

/**
 * Apply the patches to the pulled base files and return the Magisk module zip + report.
 * Precondition: initEngine() must have been awaited.
 */
export function buildModule(
  code: string,
  carrier: string,
  files: Array<{ name: string; bytes: Uint8Array }>,
  patches: { nr: string; lte: string },
) {
  const p = new Provisioner();
  try {
    for (const f of files) p.addFile(f.name, f.bytes);
    const r = p.run(code, carrier, patches.nr, patches.lte);
    try {
      return { zip: r.zip, included: r.included, warnings: r.warnings, skipped: r.skipped };
    } finally {
      r.free();
    }
  } finally {
    p.free();
  }
}
