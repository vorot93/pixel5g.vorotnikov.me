import type { AdbSession } from "./adb";

export const UECAP_DIR = "/vendor/firmware/uecapconfig";
export const TMP_ZIP = "/data/local/tmp/pixel5g-uecaps.zip";

/** Decode standard base64 to bytes (browser `atob`). */
export function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** `ro.boot.product.hardware.sku` (the Google 5-char model code). */
export async function detectSku(s: AdbSession): Promise<string> {
  return (await s.runText("getprop ro.boot.product.hardware.sku")).trim();
}

/** True if `su` yields a root shell (uid=0). */
export async function probeRoot(s: AdbSession): Promise<boolean> {
  const out = await s.runText("su -c id");
  return /uid=0/.test(out);
}

/** Basenames in the on-device uecapconfig dir (root read). */
export async function listConfigDir(s: AdbSession): Promise<string[]> {
  const out = await s.runText(`su -c 'ls ${UECAP_DIR}'`);
  return out.split(/\s+/).map((x) => x.trim()).filter(Boolean);
}

/** Pull one config file's bytes (base64 over the shell — binary-safe). */
export async function pullFile(s: AdbSession, name: string): Promise<Uint8Array> {
  const b64 = await s.runText(`su -c 'cat ${UECAP_DIR}/${name} | base64 -w0'`);
  return base64Decode(b64.trim());
}

/** Push the module zip to /data/local/tmp and install it via Magisk. Returns magisk's output. */
export async function installModule(s: AdbSession, zip: Uint8Array): Promise<string> {
  await s.pushFile(TMP_ZIP, zip);
  return s.runText(`su -c 'magisk --install-module ${TMP_ZIP}'`);
}
