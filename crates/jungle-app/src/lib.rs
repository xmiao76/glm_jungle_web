mod animals;
mod audio;
mod render;
mod view;
use gloo::{
    events::EventListener,
    render::{AnimationFrame, request_animation_frame},
    timers::callback::Timeout,
};
use jungle_core::{
    game::{Difficulty, Game, Mode},
    *,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;
use web_sys::{HtmlCanvasElement, KeyboardEvent, Worker, WorkerOptions, WorkerType};
use yew::prelude::*;

fn now() -> f64 {
    web_sys::window().unwrap().performance().unwrap().now()
}
fn message(e: JsValue) -> String {
    e.as_string()
        .or_else(|| {
            js_sys::Reflect::get(&e, &"message".into())
                .ok()
                .and_then(|s| s.as_string())
        })
        .unwrap_or_else(|| "Browser feature unavailable".into())
}
fn js<T: Serialize>(v: &T) -> Result<JsValue, JsValue> {
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
#[derive(Properties, PartialEq)]
pub struct Props {
    worker_url: String,
}
#[derive(Clone, Copy, PartialEq)]
enum Screen {
    Menu,
    Choose(Mode),
    Game,
}
pub enum Msg {
    Tick(f64),
    Mode(Mode),
    Start(Mode, u8, u8),
    Menu,
    Restart,
    Flip,
    Undo,
    Mute,
    Difficulty,
    Rules,
    Quit,
    Pointer(f64, f64),
    Worker(u64, JsValue),
    WorkerError(u64, String),
    Retry,
}
struct WorkerHandle {
    worker: Worker,
    _message: Closure<dyn FnMut(web_sys::MessageEvent)>,
    _error: Closure<dyn FnMut(web_sys::ErrorEvent)>,
}
impl Drop for WorkerHandle {
    fn drop(&mut self) {
        self.worker.set_onmessage(None);
        self.worker.set_onerror(None);
        self.worker.terminate();
    }
}
pub struct App {
    screen: Screen,
    game: Option<Game>,
    tables: Tables,
    difficulty: Difficulty,
    rules: bool,
    sounds: audio::Sounds,
    canvas: NodeRef,
    renderer: Option<render::Renderer>,
    icons: Vec<String>,
    _keyboard: EventListener,
    frame: Option<AnimationFrame>,
    worker: Option<WorkerHandle>,
    ready: bool,
    epoch: u64,
    sequence: u64,
    request: Option<String>,
    startup: Option<Timeout>,
    pending: Option<(i32, f64)>,
    due: f64,
    stats: Option<SearchResult>,
    stats_side: u8,
    error: Option<String>,
    quit_hint: bool,
}
impl App {
    fn schedule(&mut self, ctx: &Context<Self>) {
        let link = ctx.link().clone();
        self.frame = Some(request_animation_frame(move |time| {
            link.send_message(Msg::Tick(time))
        }));
    }
    fn cancel(&mut self) {
        self.epoch += 1;
        self.worker = None;
        self.ready = false;
        self.request = None;
        self.startup = None;
        self.pending = None;
    }
    fn spawn(&mut self, ctx: &Context<Self>) {
        self.cancel();
        let epoch = self.epoch;
        let opts = WorkerOptions::new();
        opts.set_type(WorkerType::Module);
        match Worker::new_with_options(&ctx.props().worker_url, &opts) {
            Ok(worker) => {
                let link = ctx.link().clone();
                let onmessage = Closure::<dyn FnMut(web_sys::MessageEvent)>::new(
                    move |event: web_sys::MessageEvent| {
                        link.send_message(Msg::Worker(epoch, event.data()))
                    },
                );
                let link = ctx.link().clone();
                let onerror = Closure::<dyn FnMut(web_sys::ErrorEvent)>::new(
                    move |e: web_sys::ErrorEvent| {
                        e.prevent_default();
                        link.send_message(Msg::WorkerError(epoch, e.message()));
                    },
                );
                worker.set_onmessage(Some(onmessage.as_ref().unchecked_ref()));
                worker.set_onerror(Some(onerror.as_ref().unchecked_ref()));
                self.worker = Some(WorkerHandle {
                    worker,
                    _message: onmessage,
                    _error: onerror,
                });
                let link = ctx.link().clone();
                self.startup = Some(Timeout::new(15000, move || {
                    link.send_message(Msg::WorkerError(
                        epoch,
                        "The WebAssembly engine did not start. Check the release files and retry."
                            .into(),
                    ))
                }));
            }
            Err(e) => self.error = Some(format!("Could not start the engine: {}", message(e))),
        }
    }
    fn start(&mut self, ctx: &Context<Self>, mode: Mode, human: u8, first: u8) {
        self.spawn(ctx);
        self.game = Some(Game::new(mode, human, first, self.difficulty, &self.tables));
        self.screen = Screen::Game;
        self.stats = None;
        self.due = now();
        self.renderer = None;
    }
    fn drive(&mut self) -> bool {
        if self.screen != Screen::Game
            || !self.ready
            || self.request.is_some()
            || self.pending.is_some()
            || self.error.is_some()
            || now() < self.due
        {
            return false;
        }
        let Some(g) = &self.game else { return false };
        if !g.ai_turn() {
            return false;
        }
        self.sequence += 1;
        let id = format!("search_{}", self.sequence);
        let mut req = serde_json::to_value(g.search_options()).unwrap();
        req["id"] = id.clone().into();
        req["pieces"] = serde_json::to_value(g.position.pieces()).unwrap();
        req["sideToMove"] = g.position.side.into();
        self.stats_side = g.position.side;
        let result =
            js(&req).and_then(|value| self.worker.as_ref().unwrap().worker.post_message(&value));
        match result {
            Ok(()) => self.request = Some(id),
            Err(e) => {
                self.error = Some(format!(
                    "Could not send the position to the engine: {}",
                    message(e)
                ))
            }
        }
        true
    }
}
impl Component for App {
    type Message = Msg;
    type Properties = Props;
    fn create(ctx: &Context<Self>) -> Self {
        let link = ctx.link().clone();
        let keyboard = EventListener::new(&web_sys::window().unwrap(), "keydown", move |e| {
            let k = e.dyn_ref::<KeyboardEvent>().unwrap();
            let msg = match k.key().to_lowercase().as_str() {
                "escape" => Some(Msg::Menu),
                "f" => Some(Msg::Flip),
                "u" => Some(Msg::Undo),
                "m" => Some(Msg::Mute),
                "z" if k.ctrl_key() || k.meta_key() => {
                    k.prevent_default();
                    Some(Msg::Undo)
                }
                _ => None,
            };
            if let Some(m) = msg {
                link.send_message(m)
            }
        });
        let mut app = Self {
            screen: Screen::Menu,
            game: None,
            tables: Tables::default(),
            difficulty: Difficulty::Medium,
            rules: false,
            sounds: audio::Sounds::new(),
            canvas: NodeRef::default(),
            renderer: None,
            icons: Vec::new(),
            _keyboard: keyboard,
            frame: None,
            worker: None,
            ready: false,
            epoch: 0,
            sequence: 0,
            request: None,
            startup: None,
            pending: None,
            due: 0.0,
            stats: None,
            stats_side: BLUE,
            error: None,
            quit_hint: false,
        };
        app.schedule(ctx);
        app
    }
    fn update(&mut self, ctx: &Context<Self>, msg: Msg) -> bool {
        match msg {
            Msg::Tick(time) => {
                self.schedule(ctx);
                let mut changed = false;
                if let Some((mv, start)) = self.pending
                    && time - start >= 180.0
                {
                    self.pending = None;
                    if let Some(g) = &mut self.game {
                        match g.play(mv, &self.tables) {
                            Ok(()) => {
                                self.sounds
                                    .play(if cap(mv) != 0 { "capture" } else { "move" });
                                if let Some(w) = g.outcome {
                                    self.sounds.play(if w == 0 { "draw" } else { "win" });
                                }
                                self.due = time + if g.mode == Mode::Ai { 400.0 } else { 0.0 };
                            }
                            Err(e) => self.error = Some(e),
                        }
                        changed = true;
                    }
                }
                changed |= self.drive();
                if self.screen == Screen::Game
                    && let (Some(renderer), Some(g)) = (&mut self.renderer, &self.game)
                    && let Err(e) = renderer.draw(g, &self.tables, time, self.pending)
                    && self.error.is_none()
                {
                    self.error = Some(format!("Board rendering failed: {}", message(e)));
                    changed = true;
                }
                changed
            }
            Msg::Mode(mode) => {
                self.sounds.unlock();
                self.screen = Screen::Choose(mode);
                true
            }
            Msg::Start(mode, human, first) => {
                self.sounds.unlock();
                self.error = None;
                self.start(ctx, mode, human, first);
                true
            }
            Msg::Menu => {
                self.cancel();
                self.screen = Screen::Menu;
                self.renderer = None;
                self.game = None;
                self.error = None;
                true
            }
            Msg::Restart => {
                if let Some(g) = &self.game {
                    let (mode, human, first) = (g.mode, g.human, g.first);
                    self.error = None;
                    self.start(ctx, mode, human, first);
                }
                true
            }
            Msg::Flip => {
                if let Some(g) = &mut self.game {
                    g.flipped = !g.flipped;
                }
                true
            }
            Msg::Undo => {
                if self.request.is_none()
                    && self.pending.is_none()
                    && self.game.as_ref().is_some_and(|g| g.can_undo())
                {
                    self.spawn(ctx);
                    if let Some(g) = &mut self.game {
                        g.undo();
                    }
                    self.stats = None;
                    self.error = None;
                }
                true
            }
            Msg::Mute => {
                self.sounds.unlock();
                self.sounds.toggle();
                true
            }
            Msg::Difficulty => {
                self.difficulty = self.difficulty.next();
                true
            }
            Msg::Rules => {
                self.rules = !self.rules;
                true
            }
            Msg::Quit => {
                self.quit_hint = true;
                true
            }
            Msg::Pointer(x, y) => {
                self.sounds.unlock();
                if self.request.is_some() || self.pending.is_some() || self.error.is_some() {
                    return false;
                }
                if let (Some(g), Some(renderer)) = (&mut self.game, &self.renderer)
                    && let Some(s) = renderer.square(x, y, g.flipped)
                {
                    if let Some(mv) = g.select(s, &self.tables) {
                        self.pending = Some((mv, now()));
                    }
                    return true;
                }
                false
            }
            Msg::Worker(epoch, data) => {
                if epoch != self.epoch {
                    return false;
                }
                let value: serde_json::Value = match serde_wasm_bindgen::from_value(data) {
                    Ok(v) => v,
                    Err(e) => {
                        self.error = Some(format!("Invalid engine response: {e}"));
                        self.request = None;
                        return true;
                    }
                };
                let kind = value["type"].as_str().unwrap_or("").to_owned();
                if kind == "ready" {
                    self.startup = None;
                    if value["version"].as_str() != Some(VERSION) {
                        self.error=Some("The application and engine versions differ. Extract the complete release ZIP and retry.".into());
                    } else {
                        self.ready = true;
                        self.drive();
                    }
                    return true;
                }
                if kind == "init-error" {
                    self.startup = None;
                    self.error = Some(
                        value["message"]
                            .as_str()
                            .unwrap_or("WebAssembly engine failed to load")
                            .into(),
                    );
                    self.request = None;
                    return true;
                }
                if value["id"].as_str() != self.request.as_deref() {
                    return false;
                }
                if kind == "error" {
                    self.error = Some(value["message"].as_str().unwrap_or("Search failed").into());
                    self.request = None;
                    return true;
                }
                let result: SearchResult = match serde_json::from_value(value) {
                    Ok(v) => v,
                    Err(e) => {
                        self.error = Some(format!("Invalid search result: {e}"));
                        self.request = None;
                        return true;
                    }
                };
                if kind == "result" {
                    self.request = None;
                    if let Some(g) = &mut self.game {
                        if let Some(m) = result.best_move {
                            let (f, d) = m.squares();
                            if m.from_row >= 9 || m.to_row >= 9 || m.from_col >= 7 || m.to_col >= 7
                            {
                                self.error = Some("Engine returned an invalid square".into());
                            } else {
                                let mv = encode(f, d, g.position.grid[d]);
                                if g.legal(&self.tables).contains(&mv) {
                                    self.pending = Some((mv, now()));
                                } else {
                                    self.error = Some("Engine returned an illegal move".into());
                                }
                            }
                        } else if g.legal(&self.tables).is_empty() {
                            g.outcome = Some(other(g.position.side));
                        } else {
                            self.error =
                                Some("Engine returned no move for a playable position".into());
                        }
                    }
                }
                self.stats = Some(result);
                true
            }
            Msg::WorkerError(epoch, e) => {
                if epoch != self.epoch {
                    return false;
                }
                self.startup = None;
                self.error = Some(format!("Engine unavailable: {e}"));
                self.ready = false;
                self.request = None;
                true
            }
            Msg::Retry => {
                self.error = None;
                self.spawn(ctx);
                true
            }
        }
    }
    fn rendered(&mut self, ctx: &Context<Self>, _first: bool) {
        if self.screen == Screen::Game
            && self.renderer.is_none()
            && self.error.is_none()
            && let Some(canvas) = self.canvas.cast::<HtmlCanvasElement>()
        {
            match render::Renderer::new(canvas) {
                Ok(r) => {
                    self.icons = r.icon_urls();
                    self.renderer = Some(r);
                }
                Err(e) => ctx
                    .link()
                    .send_message(Msg::WorkerError(self.epoch, message(e))),
            }
        }
        if let Some(el) = web_sys::window()
            .unwrap()
            .document()
            .unwrap()
            .get_element_by_id("move-log")
            && let Some(el) = el.dyn_ref::<web_sys::HtmlElement>()
        {
            el.set_scroll_top(el.scroll_height());
        }
    }
    fn view(&self, ctx: &Context<Self>) -> Html {
        self.render_view(ctx)
    }
}
#[wasm_bindgen]
pub fn start_app(root_id: &str, worker_url: &str) -> Result<(), JsValue> {
    let root = web_sys::window()
        .ok_or("Browser window unavailable")?
        .document()
        .ok_or("Document unavailable")?
        .get_element_by_id(root_id)
        .ok_or("Application root missing")?;
    yew::Renderer::<App>::with_root_and_props(
        root,
        Props {
            worker_url: worker_url.into(),
        },
    )
    .render();
    Ok(())
}
