import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { ReadableStream, type MaybeConsumable } from "@yume-chan/stream-extra";

/** What the rest of the app depends on — no ya-webadb types leak past this file. */
export interface AdbSession {
  runText(command: string): Promise<string>;
  pushFile(filename: string, bytes: Uint8Array): Promise<void>;
  reboot(): Promise<void>;
  close(): Promise<void>;
}

/** True only in a browser that exposes WebUSB (Chromium-family). */
export function isWebUsbAvailable(): boolean {
  return !!AdbDaemonWebUsbDeviceManager.BROWSER;
}

/** Prompt the WebUSB device picker, authenticate ADB, and return a session.
 *  The device shows an "Allow USB debugging?" prompt on first connect. */
export async function connect(): Promise<AdbSession> {
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
  if (!manager) {
    throw new Error("WebUSB is unavailable. Use Chrome or Edge on desktop.");
  }
  const device = await manager.requestDevice();
  if (!device) {
    throw new Error("No device selected.");
  }
  const connection = await device.connect();
  const credentialStore = new AdbWebCredentialStore("pixel5g.vorotnikov.me");
  const transport = await AdbDaemonTransport.authenticate({
    serial: device.serial,
    connection,
    credentialStore,
  });
  const adb = new Adb(transport);

  return {
    runText: (command) => adb.subprocess.noneProtocol.spawnWaitText(command),
    async pushFile(filename, bytes) {
      const sync = await adb.sync();
      try {
        // Pin 0o644 (rw-r--r--); ya-webadb's sync.write otherwise defaults to 0o666
        // (world-writable). Magisk only needs to read the module zip, never execute it.
        const file = ReadableStream.from<MaybeConsumable<Uint8Array>>([bytes]);
        await sync.write({ filename, file, permission: 0o644 });
      } finally {
        await sync.dispose();
      }
    },
    reboot: async () => {
      // power.reboot() resolves to the daemon's response string; intentionally discarded
      // because AdbSession.reboot is declared void.
      await adb.power.reboot();
    },
    close: async () => {
      await adb.close();
    },
  };
}
