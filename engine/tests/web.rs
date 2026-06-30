use wasm_bindgen_test::*;
use pixel5g_engine::{device_model, select_files};

#[wasm_bindgen_test]
fn device_model_resolves_known_sku() {
    let m = device_model("GUL82").expect("GUL82 known");
    assert_eq!(m.code(), "GUL82");
    assert_eq!(m.lte_id(), 1254026417);
}

#[wasm_bindgen_test]
fn select_files_picks_two() {
    let avail = vec![
        "lte_1254026417.binarypb".to_string(),
        "APAC_COMMON_3616442437.binarypb".to_string(),
    ];
    let sel = select_files("GUL82", "APAC_COMMON", avail);
    assert!(sel.errors().is_empty());
    assert_eq!(sel.to_pull().len(), 2);
}
