use pixel_uecaps_toolbox::{model, provision};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn start() {
    // Surface Rust panics in the browser console during development.
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub struct ModelInfoJs {
    code: String,
    display: String,
    lte_id: u64,
    nr_anchor: u64,
}

#[wasm_bindgen]
impl ModelInfoJs {
    #[wasm_bindgen(getter)] pub fn code(&self) -> String { self.code.clone() }
    #[wasm_bindgen(getter)] pub fn display(&self) -> String { self.display.clone() }
    #[wasm_bindgen(getter, js_name = lteId)] pub fn lte_id(&self) -> u64 { self.lte_id }
    #[wasm_bindgen(getter, js_name = nrAnchor)] pub fn nr_anchor(&self) -> u64 { self.nr_anchor }
}

/// `ro.boot.product.hardware.sku` → resolved model, or `undefined`.
#[wasm_bindgen(js_name = deviceModel)]
pub fn device_model(sku: &str) -> Option<ModelInfoJs> {
    model::device_model(sku).map(|m| ModelInfoJs {
        code: m.code.to_string(),
        display: m.display.to_string(),
        lte_id: m.lte_id,
        nr_anchor: m.nr_anchor,
    })
}

#[wasm_bindgen]
pub struct SelectionJs {
    to_pull: Vec<String>,
    errors: Vec<String>,
}

#[wasm_bindgen]
impl SelectionJs {
    #[wasm_bindgen(getter, js_name = toPull)] pub fn to_pull(&self) -> Vec<String> { self.to_pull.clone() }
    #[wasm_bindgen(getter)] pub fn errors(&self) -> Vec<String> { self.errors.clone() }
}

#[wasm_bindgen(js_name = selectFiles)]
pub fn select_files(code: &str, carrier: &str, available: Vec<String>) -> SelectionJs {
    let sel = provision::select_files(code, carrier, &available);
    SelectionJs { to_pull: sel.to_pull, errors: sel.errors }
}

#[wasm_bindgen]
pub struct ProvisionResultJs {
    zip: Vec<u8>,
    included: Vec<String>,
    warnings: Vec<String>,
    skipped: usize,
}

#[wasm_bindgen]
impl ProvisionResultJs {
    #[wasm_bindgen(getter)] pub fn zip(&self) -> Vec<u8> { self.zip.clone() }
    #[wasm_bindgen(getter)] pub fn included(&self) -> Vec<String> { self.included.clone() }
    #[wasm_bindgen(getter)] pub fn warnings(&self) -> Vec<String> { self.warnings.clone() }
    #[wasm_bindgen(getter)] pub fn skipped(&self) -> usize { self.skipped }
}

/// Accumulates the pulled base files, then runs the in-memory provision.
#[wasm_bindgen]
pub struct Provisioner {
    files: Vec<(String, Vec<u8>)>,
}

#[wasm_bindgen]
impl Provisioner {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Provisioner { Provisioner { files: Vec::new() } }

    #[wasm_bindgen(js_name = addFile)]
    pub fn add_file(&mut self, name: String, bytes: &[u8]) {
        self.files.push((name, bytes.to_vec()));
    }

    pub fn run(&self, code: &str, carrier: &str, nr_patch: &str, lte_patch: &str)
        -> Result<ProvisionResultJs, JsError> {
        let r = provision::provision_in_memory(code, carrier, &self.files, nr_patch, lte_patch)
            .map_err(|e| JsError::new(&format!("{e:#}")))?;
        Ok(ProvisionResultJs { zip: r.zip, included: r.included, warnings: r.warnings, skipped: r.skipped })
    }
}
