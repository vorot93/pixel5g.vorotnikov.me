#!/usr/bin/env bash
set -euo pipefail
export CARGO_NET_GIT_FETCH_WITH_CLI=true
cd "$(dirname "$0")/.."
# Build the engine crate to a web-target wasm package, then place it where engine.ts imports it.
wasm-pack build engine --release --target web --out-dir pkg --out-name engine
rm -rf src/lib/engine-pkg
mkdir -p src/lib/engine-pkg
cp engine/pkg/engine.js engine/pkg/engine_bg.wasm engine/pkg/engine.d.ts src/lib/engine-pkg/
echo "build-wasm: wrote src/lib/engine-pkg/"
