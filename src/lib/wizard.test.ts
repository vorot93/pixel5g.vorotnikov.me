import { it, expect, vi } from "vitest";
import { prepareInputs, buildPrepared, PreconditionError } from "./wizard";
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

it("prepareInputs→buildPrepared runs detect→probe→read→build and returns the module (the real wizard sequence)", async () => {
  const s = session({
    "getprop ro.boot.product.hardware.sku": "GUL82\n",
    "su -c id": "uid=0(root)",
    "ls /vendor/firmware/uecapconfig": "lte_1254026417.binarypb APAC_COMMON_3616442437.binarypb",
    "base64 -w0": btoa("\x00\x01"),
  });
  const log: string[] = [];
  const inputs = await prepareInputs(s, engine, (m) => log.push(m));
  const res = await buildPrepared(engine, inputs, (m) => log.push(m));
  expect(res.model.code).toBe("GUL82");
  expect(Array.from(res.zip)).toEqual([1, 2, 3]);
  expect(engine.buildModule).toHaveBeenCalledWith("GUL82", "APAC_COMMON", inputs.files, { nr: "kind=\"nr\"", lte: "kind=\"lte\"" });
  expect(log.some((l) => l.includes("Pixel 10 Pro XL"))).toBe(true);
});

it("prepareInputs rejects an unrooted device with a PreconditionError", async () => {
  const s = session({ "getprop ro.boot.product.hardware.sku": "GUL82", "su -c id": "su: not found" });
  await expect(prepareInputs(s, engine, () => {})).rejects.toBeInstanceOf(PreconditionError);
});

it("prepareInputs rejects an unknown SKU", async () => {
  const s = session({ "getprop ro.boot.product.hardware.sku": "ZZ999", "su -c id": "uid=0" });
  await expect(prepareInputs(s, engine, () => {})).rejects.toBeInstanceOf(PreconditionError);
});

it("prepareInputs rejects an empty selection (no errors, no files) with a PreconditionError", async () => {
  const s = session({ "getprop ro.boot.product.hardware.sku": "GUL82", "su -c id": "uid=0", "ls /vendor/firmware/uecapconfig": "" });
  const emptyEngine = { ...engine, chooseFiles: () => ({ toPull: [] as string[], errors: [] as string[] }) };
  await expect(prepareInputs(s, emptyEngine, () => {})).rejects.toBeInstanceOf(PreconditionError);
});

it("prepareInputs detects→probes→reads→pulls and returns model + files, without building or loading patches", async () => {
  const s = session({
    "getprop ro.boot.product.hardware.sku": "GUL82\n",
    "su -c id": "uid=0(root)",
    "ls /vendor/firmware/uecapconfig": "lte_1254026417.binarypb APAC_COMMON_3616442437.binarypb",
    "base64 -w0": btoa("\x00\x01"),
  });
  const buildModule = vi.fn();
  const loadPatches = vi.fn(async () => ({ nr: "", lte: "" }));
  const inputs = await prepareInputs(s, { ...engine, buildModule, loadPatches }, () => {});
  expect(inputs.model).toEqual({ code: "GUL82", display: "Pixel 10 Pro XL" });
  expect(inputs.files.map((f) => f.name)).toEqual([
    "lte_1254026417.binarypb", "APAC_COMMON_3616442437.binarypb",
  ]);
  // Assert the real decoded bytes, not just "is a Uint8Array": mock returns btoa("\x00\x01") → [0, 1].
  expect(Array.from(inputs.files[0]!.bytes)).toEqual([0, 1]);
  // "No build, no WASM" contract: neither building nor patch-loading happens in prepareInputs.
  expect(buildModule).not.toHaveBeenCalled();
  expect(loadPatches).not.toHaveBeenCalled();
});

it("buildPrepared loads patches and builds the module from already-pulled inputs", async () => {
  const buildModule = vi.fn(() => ({ zip: new Uint8Array([7, 8]), included: ["lte_1254026417.binarypb"], warnings: ["w"], skipped: 2 }));
  const loadPatches = vi.fn(async () => ({ nr: "N", lte: "L" }));
  const inputs = { model: { code: "GUL82", display: "Pixel 10 Pro XL" }, files: [{ name: "lte_1254026417.binarypb", bytes: new Uint8Array([1]) }] };
  const res = await buildPrepared({ ...engine, buildModule, loadPatches }, inputs, () => {});
  expect(loadPatches).toHaveBeenCalledOnce();
  expect(buildModule).toHaveBeenCalledWith("GUL82", "APAC_COMMON", inputs.files, { nr: "N", lte: "L" });
  expect(Array.from(res.zip)).toEqual([7, 8]);
  expect(res.model).toEqual({ code: "GUL82", display: "Pixel 10 Pro XL" });
  expect(res.skipped).toBe(2);
  expect(res.warnings).toEqual(["w"]);
});
