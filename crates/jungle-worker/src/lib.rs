use jungle_core::{Engine as CoreEngine, evaluation::evaluate, *};
use serde::{Deserialize, Serialize};
use std::{cell::RefCell, rc::Rc};
use wasm_bindgen::prelude::*;

fn error(e: impl ToString) -> JsValue {
    js_sys::Error::new(&e.to_string()).into()
}
fn js<T: Serialize>(v: &T) -> Result<JsValue, JsValue> {
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(error)
}
fn decode<T: serde::de::DeserializeOwned>(v: JsValue) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(v).map_err(error)
}
fn now() -> f64 {
    let performance = js_sys::Reflect::get(&js_sys::global(), &"performance".into()).unwrap();
    let function = js_sys::Reflect::get(&performance, &"now".into())
        .unwrap()
        .unchecked_into::<js_sys::Function>();
    function.call0(&performance).unwrap().as_f64().unwrap()
}

/// Identical WebAssembly engine used by the browser worker and Node tools.
#[wasm_bindgen]
pub struct Engine {
    inner: CoreEngine,
}
#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new(tt_bits: u32) -> Self {
        Self {
            inner: CoreEngine::new(tt_bits),
        }
    }
    pub fn clear(&mut self) {
        self.inner.tt.clear()
    }
    pub fn search(
        &mut self,
        pieces: JsValue,
        side: u8,
        options: JsValue,
        on_iteration: Option<js_sys::Function>,
    ) -> Result<JsValue, JsValue> {
        let pieces: Pieces = decode(pieces)?;
        let options: SearchOptions = decode(options)?;
        let result = self
            .inner
            .search(&pieces, side, &options, &mut now, &mut |r| {
                if let Some(f) = &on_iteration {
                    let _ = f.call1(&JsValue::NULL, &js(r).unwrap());
                }
            })
            .map_err(error)?;
        js(&result)
    }
    pub fn inspect(&self, pieces: JsValue, side: u8) -> Result<JsValue, JsValue> {
        let pieces: Pieces = decode(pieces)?;
        let p = Position::from_pieces(&pieces, side, &self.inner.tables).map_err(error)?;
        js(
            &serde_json::json!({"moves":p.moves(side,&self.inner.tables),"hash":p.hash,"evaluation":evaluate(&p,side,&self.inner.tables),"winner":p.winner(),"material":p.mat,"pst":p.pst}),
        )
    }
    pub fn set_weights(&mut self, weights: JsValue) -> Result<(), JsValue> {
        let w: Weights = decode(weights)?;
        if serde_json::to_value(&w)
            .map_err(error)?
            .as_object()
            .unwrap()
            .values()
            .any(|v| v.as_f64().is_none_or(|x| !x.is_finite()))
        {
            return Err(error("Weights must be finite"));
        }
        self.inner.tables = Tables::new(w);
        self.clear();
        Ok(())
    }
    pub fn defaults(&self) -> Result<JsValue, JsValue> {
        js(&Weights::default())
    }
    pub fn round_trip(&self, pieces: JsValue, side: u8, mv: i32) -> Result<JsValue, JsValue> {
        let mut p = Position::from_pieces(&decode::<Pieces>(pieces)?, side, &self.inner.tables)
            .map_err(error)?;
        if !p.moves(side, &self.inner.tables).contains(&mv) {
            return Err(error("Invalid move"));
        }
        p.make(mv, &self.inner.tables);
        p.undo(mv, &self.inner.tables);
        js(&serde_json::json!({"pieces":p.pieces(),"hash":p.hash,"material":p.mat,"pst":p.pst}))
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    id: String,
    pieces: Pieces,
    side_to_move: u8,
    #[serde(flatten)]
    options: SearchOptions,
}

#[wasm_bindgen]
pub fn version() -> String {
    VERSION.into()
}

#[wasm_bindgen]
pub fn start_worker() -> Result<(), JsValue> {
    let scope = js_sys::global().unchecked_into::<web_sys::DedicatedWorkerGlobalScope>();
    let engine = Rc::new(RefCell::new(CoreEngine::default()));
    let target = scope.clone();
    let handler =
        Closure::<dyn FnMut(web_sys::MessageEvent)>::new(move |event: web_sys::MessageEvent| {
            let data = event.data();
            let id = js_sys::Reflect::get(&data, &"id".into())
                .ok()
                .and_then(|v| v.as_string())
                .unwrap_or_default();
            let send = |value: serde_json::Value| {
                let _ = target.post_message(&js(&value).unwrap());
            };
            match serde_wasm_bindgen::from_value::<Request>(data) {
                Ok(req) => {
                    let mut engine = engine.borrow_mut();
                    engine.tt.clear();
                    let result = engine.search(
                        &req.pieces,
                        req.side_to_move,
                        &req.options,
                        &mut now,
                        &mut |r| {
                            let mut v = serde_json::to_value(r).unwrap();
                            v["id"] = id.clone().into();
                            v["type"] = "iteration".into();
                            send(v)
                        },
                    );
                    match result {
                        Ok(r) => {
                            let mut v = serde_json::to_value(r).unwrap();
                            v["id"] = req.id.into();
                            v["type"] = "result".into();
                            send(v)
                        }
                        Err(e) => send(serde_json::json!({"type":"error","id":id,"message":e})),
                    }
                }
                Err(e) => send(serde_json::json!({"type":"error","id":id,"message":e.to_string()})),
            }
        });
    scope.set_onmessage(Some(handler.as_ref().unchecked_ref()));
    handler.forget();
    scope.post_message(&js(&serde_json::json!({"type":"ready","version":VERSION}))?)?;
    Ok(())
}
