import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the generated wasm package BEFORE importing engine.ts.
const addFile = vi.fn();
const provisionerFree = vi.fn();
const run = vi.fn(() => ({ zip: new Uint8Array([1, 2, 3]), included: ["lte_1.binarypb"], warnings: [], skipped: 0, free: () => {} }));
vi.mock("./engine-pkg/engine.js", () => ({
  default: vi.fn(async () => {}),                  // init()
  deviceModel: (sku: string) => (sku === "GUL82" ? { code: "GUL82", display: "X", lteId: 1n, nrAnchor: 2n, free: () => {} } : undefined),
  selectFiles: (_c: string, _carrier: string, avail: string[]) => ({ toPull: avail.slice(0, 2), errors: [], free: () => {} }),
  Provisioner: class { addFile = addFile; run = run; free = provisionerFree; },
}));

import { initEngine, detectModel, chooseFiles, loadPatches, buildModule, CARRIER } from "./engine";

beforeEach(() => { addFile.mockClear(); run.mockClear(); provisionerFree.mockClear(); });

describe("engine glue", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("CARRIER is APAC_COMMON", () => expect(CARRIER).toBe("APAC_COMMON"));

  it("loadPatches fetches both bundled TOMLs", async () => {
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, text: async () => `text:${url}` }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    await initEngine();
    const { nr, lte } = await loadPatches();
    expect(nr).toContain("patches/nr_patch.toml");
    expect(lte).toContain("patches/lte_patch.toml");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("buildModule feeds every file to the Provisioner then runs", async () => {
    await initEngine();
    const res = buildModule("GUL82", CARRIER,
      [{ name: "lte_1.binarypb", bytes: new Uint8Array([9]) }, { name: "APAC_COMMON_2.binarypb", bytes: new Uint8Array([8]) }],
      { nr: "kind=\"nr\"", lte: "kind=\"lte\"" });
    expect(addFile).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledWith("GUL82", "APAC_COMMON", "kind=\"nr\"", "kind=\"lte\"");
    expect(Array.from(res.zip)).toEqual([1, 2, 3]);
    expect(res.included).toEqual(["lte_1.binarypb"]);
    expect(res.warnings).toEqual([]);
    expect(res.skipped).toBe(0);
  });

  it("detectModel / chooseFiles forward to wasm", () => {
    expect(detectModel("GUL82")?.code).toBe("GUL82");
    expect(detectModel("ZZ")).toBeUndefined();
    expect(chooseFiles("GUL82", CARRIER, ["a", "b", "c"]).toPull).toEqual(["a", "b"]);
    expect(chooseFiles("GUL82", CARRIER, ["a", "b", "c"]).errors).toEqual([]);
  });
});
