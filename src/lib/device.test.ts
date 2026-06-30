import { describe, it, expect, vi } from "vitest";
import { detectSku, probeRoot, listConfigDir, pullFile, installModule, base64Decode, UECAP_DIR, TMP_ZIP } from "./device";
import type { AdbSession } from "./adb";

function mockSession(runText: (cmd: string) => Promise<string>, pushFile = vi.fn(async () => {})): AdbSession {
  return { runText: vi.fn(runText), pushFile, reboot: vi.fn(async () => {}), close: vi.fn(async () => {}) };
}

describe("device ops", () => {
  it("detectSku trims getprop output", async () => {
    const s = mockSession(async (c) => (c.includes("getprop ro.boot.product.hardware.sku") ? "GUL82\n" : ""));
    expect(await detectSku(s)).toBe("GUL82");
  });

  it("probeRoot is true only when su reports uid=0", async () => {
    expect(await probeRoot(mockSession(async () => "uid=0(root) gid=0(root)"))).toBe(true);
    expect(await probeRoot(mockSession(async () => "/system/bin/sh: su: not found"))).toBe(false);
  });

  it("listConfigDir splits whitespace-separated ls output", async () => {
    const s = mockSession(async () => "lte_1254026417.binarypb  APAC_COMMON_3616442437.binarypb\nap_plmn_mapping.binarypb\n");
    expect(await listConfigDir(s)).toEqual([
      "lte_1254026417.binarypb", "APAC_COMMON_3616442437.binarypb", "ap_plmn_mapping.binarypb",
    ]);
  });

  it("base64Decode round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const b64 = btoa(String.fromCharCode(...bytes));
    expect(Array.from(base64Decode(b64))).toEqual([0, 1, 2, 250, 255]);
  });

  it("pullFile base64-decodes a su cat", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const b64 = btoa(String.fromCharCode(...bytes));
    const s = mockSession(async (c) => {
      expect(c).toBe(`su -c 'cat ${UECAP_DIR}/lte_1.binarypb | base64 -w0'`);
      return b64 + "\n";
    });
    expect(Array.from(await pullFile(s, "lte_1.binarypb"))).toEqual([9, 8, 7]);
  });

  it("installModule pushes the zip then runs magisk --install-module", async () => {
    const push = vi.fn(async () => {});
    const s = mockSession(async (c) => {
      expect(c).toBe(`su -c 'magisk --install-module ${TMP_ZIP}'`);
      return "- Installing module\n- Done";
    }, push);
    const zip = new Uint8Array([1, 2, 3]);
    const out = await installModule(s, zip);
    expect(push).toHaveBeenCalledWith(TMP_ZIP, zip);
    expect(out).toContain("Done");
  });
});
