# Manual device test — pixel5g provisioner

Prereqs: a **rooted (Magisk)** Pixel 9/10, USB cable, Chrome/Edge on desktop, USB debugging ON.

1. `pnpm build` (unsandboxed) → serve `dist/` (`pnpm dlx serve dist`) or open the deployed site.
2. Connect the phone; click **Connect** → pick the device → approve "Allow USB debugging?".
3. Verify step 2 shows the correct model (compare with `adb shell getprop ro.boot.product.hardware.sku`).
4. Verify step 3 lists + pulls `lte_<id>` + `APAC_COMMON_<n>`; step 4 reports built module (+ any dropped combos).
5. Click **Install & reboot**; after reboot, confirm the module is active in the Magisk app and check bands (e.g. with `pixel-uecaps-toolbox inspect` on the pulled file, or a field-test dialer).
6. Negative checks: non-rooted device → clear "not rooted" error; non-Chromium browser → WebUSB message; unknown SKU → unsupported message.

## Deploy

- The repo is local-only. To deploy: add a GitHub remote, push `main`; the Pages workflow builds the wasm + static site and deploys to `pixel5g.vorotnikov.me` (set the custom domain in repo Settings → Pages; DNS CNAME → GitHub Pages).
