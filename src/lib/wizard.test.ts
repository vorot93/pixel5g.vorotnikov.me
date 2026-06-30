import { it, expect, vi } from "vitest";
import { prepareModule, PreconditionError } from "./wizard";
import type { AdbSession } from "./adb";

const engine = {
  CARRIER: "APAC_COMMON",
  detectModel: (sku: string) => (sku === "GUL82" ? { code: "GUL82", display: "Pixel 10 Pro XL", lteId: 1n, nrAnchor: 2n } : undefined),
  chooseFiles: (_c: string, _carrier: string, avail: string[]) => ({
    toPull: ["lte_1254026417.binarypb", "APAC_COMMON_3616442437.binarypb"], errors: [] as string[],
  }),
  loadPatches: vi.fn(async () => ({ nr: "kind=\"nr\"", lte: "kind=\"lte\"" })),
  buildModule: vi.fn(() => ({ zip: new Uint8Array([1, 2, 3]), included: ["lte_1254026417.binarypb"], warnings: [], skipped: 0 })),
};

function session(map: Record<string, string>): AdbSession {
  return {
    runText: vi.fn(async (cmd) => {
      for (const k of Object.keys(map)) if (cmd.includes(k)) return map[k] ?? "";
      return "";
    }),
    pushFile: vi.fn(async () => {}), reboot: vi.fn(async () => {}), close: vi.fn(async () => {}),
  };
}

it("prepareModule runs detect→probe→read→build and returns the module", async () => {
  const s = session({
    "getprop ro.boot.product.hardware.sku": "GUL82\n",
    "su -c id": "uid=0(root)",
    "ls /vendor/firmware/uecapconfig": "lte_1254026417.binarypb APAC_COMMON_3616442437.binarypb",
    "base64 -w0": btoa("\x00\x01"),
  });
  const log: string[] = [];
  const res = await prepareModule(s, engine, (m) => log.push(m));
  expect(res.model.code).toBe("GUL82");
  expect(Array.from(res.zip)).toEqual([1, 2, 3]);
  expect(engine.buildModule).toHaveBeenCalledWith("GUL82", "APAC_COMMON", expect.any(Array), { nr: "kind=\"nr\"", lte: "kind=\"lte\"" });
  expect(log.some((l) => l.includes("Pixel 10 Pro XL"))).toBe(true);
});

it("prepareModule rejects an unrooted device with a PreconditionError", async () => {
  const s = session({ "getprop ro.boot.product.hardware.sku": "GUL82", "su -c id": "su: not found" });
  await expect(prepareModule(s, engine, () => {})).rejects.toBeInstanceOf(PreconditionError);
});

it("prepareModule rejects an unknown SKU", async () => {
  const s = session({ "getprop ro.boot.product.hardware.sku": "ZZ999", "su -c id": "uid=0" });
  await expect(prepareModule(s, engine, () => {})).rejects.toBeInstanceOf(PreconditionError);
});

it("prepareModule rejects an empty selection (no errors, no files) with a PreconditionError", async () => {
  const s = session({ "getprop ro.boot.product.hardware.sku": "GUL82", "su -c id": "uid=0", "ls /vendor/firmware/uecapconfig": "" });
  const emptyEngine = { ...engine, chooseFiles: () => ({ toPull: [] as string[], errors: [] as string[] }) };
  await expect(prepareModule(s, emptyEngine, () => {})).rejects.toBeInstanceOf(PreconditionError);
});
