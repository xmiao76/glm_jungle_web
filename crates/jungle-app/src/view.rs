use super::*;
impl App {
    fn button(
        &self,
        ctx: &Context<Self>,
        label: impl Into<AttrValue>,
        action: fn() -> Msg,
    ) -> Html {
        html! {<button class="menu-btn" onclick={ctx.link().callback(move |_|action())}>{label.into()}</button>}
    }
    pub fn render_view(&self, ctx: &Context<Self>) -> Html {
        let view = match self.screen {
            Screen::Menu => {
                html! {<main class="menu"><div class="menu-bg"/><div class="menu-heading"><h1 class="menu-hero-title">{"JUNGLE"}</h1><p>{"Dou Shou Qi · Animal Chess"}</p></div><div class="menu-buttons">
                {self.button(ctx,"Human vs AI",||Msg::Mode(Mode::Human))}{self.button(ctx,"AI vs AI",||Msg::Mode(Mode::Ai))}
                {self.button(ctx,format!("Difficulty: {}",self.difficulty.name()),||Msg::Difficulty)}{self.button(ctx,if self.rules {"Hide How to play"} else {"How to play"},||Msg::Rules)}{self.button(ctx,"Quit",||Msg::Quit)}
                </div>{if self.rules {rules()} else {Html::default()}}{if self.quit_hint {html!{<p class="quit-hint">{"Close this browser tab to quit. Stop the local launcher with Ctrl+C."}</p>}} else {Html::default()}}
                <footer class="credits-footer">{"Original: GLM-5.3 · Claude Code | WebAssembly port: OpenAI Codex"}<br/>{format!("Engine v{VERSION} · runs entirely in your browser")}</footer></main>}
            }
            Screen::Choose(mode) => {
                let choices: Vec<(&str, u8, u8)> = if mode == Mode::Human {
                    vec![
                        ("Blue - You first", BLUE, BLUE),
                        ("Blue - AI first", BLUE, RED),
                        ("Red - You first", RED, RED),
                        ("Red - AI first", RED, BLUE),
                    ]
                } else {
                    vec![("Blue First", BLUE, BLUE), ("Red First", RED, RED)]
                };
                html! {<main class="menu"><div class="menu-bg"/><div class="menu-heading"><h2>{if mode==Mode::Human {"Human vs AI"} else {"AI vs AI"}}</h2><p>{"Who moves first?"}</p></div><div class="menu-buttons">{for choices.into_iter().map(|(label,human,first)|html!{<button class={classes!("menu-btn",if human==BLUE {"blue-button"} else {"red-button"})} onclick={ctx.link().callback(move |_|Msg::Start(mode,human,first))}>{label}</button>})}{self.button(ctx,"Back",||Msg::Menu)}</div></main>}
            }
            Screen::Game => {
                let g = self.game.as_ref().unwrap();
                let side = if g.position.side == BLUE {
                    "Blue"
                } else {
                    "Red"
                };
                let score = self.stats.as_ref().map(|s| {
                    if self.stats_side == BLUE {
                        s.score
                    } else {
                        -s.score
                    }
                });
                let blue = score.map_or(50.0, |s| 50.0 + 50.0 * (s / 2500.0).tanh());
                let canvas = self.canvas.clone();
                let onpointer = ctx.link().callback(move |e: PointerEvent| {
                    let c = canvas.cast::<HtmlCanvasElement>().unwrap();
                    let r = c.get_bounding_client_rect();
                    Msg::Pointer(
                        e.client_x() as f64 - r.left(),
                        e.client_y() as f64 - r.top(),
                    )
                });
                html! {<main class="game" data-engine="webassembly" data-move-count={g.log.len().to_string()} data-state={if g.outcome.is_some(){"game-over"}else if self.request.is_some(){"thinking"}else if self.pending.is_some(){"animating"}else{"playing"}}>
                    <div class="board-area"><canvas ref={self.canvas.clone()} onpointerdown={onpointer} aria-label="Jungle game board"/></div>
                    <aside class="side-panel"><section class="panel-card"><h3>{"Game"}</h3><div class="turn-row"><span class={classes!("side-dot",if g.position.side==BLUE {"blue"} else {"red"})}/><strong>{format!("{side} to move")}</strong><span class="turn-number">{format!("#{}",g.turn)}</span></div></section>
                    <section class="panel-card"><h3>{"Position"}</h3><div class="eval-bar"><div style={format!("width:{blue}%")}/></div></section>
                    <section class="panel-card engine-card"><h3>{"Engine"}</h3>{if let Some(s)=&self.stats {html!{<><p>{format!("Depth {}   Score {:.0}",s.depth,s.score/10.0)}</p><p>{format!("{:.0}k/s   {}",s.nps/1000.0,g.difficulty.name())}</p></>}} else {html!{<p>{if self.ready {"Waiting for engine…"} else {"Loading engine…"}}</p>}}}<small>{"WebAssembly"}</small></section>
                    <section class="panel-card"><h3>{"Captured"}</h3>{for [BLUE,RED].into_iter().map(|side|html!{<div class="captured-row"><span class={if side==BLUE {"blue-text"}else{"red-text"}}>{if side==BLUE {"Blue"} else {"Red"}}</span><span class="capture-tokens">{if g.captured[side as usize].is_empty(){html!{"—"}}else{g.captured[side as usize].iter().map(|&p| {let index=((other(side)-1)*8+p-1) as usize;html!{<img class="captured-token" src={self.icons.get(index).cloned().unwrap_or_default()} alt={format!("Captured {}",NAMES[p as usize])} title={NAMES[p as usize]}/>}}).collect::<Html>()}}</span></div>})}</section>
                    <section class="panel-card controls"><button class="small-btn" disabled={!g.can_undo()||self.request.is_some()||self.pending.is_some()} onclick={ctx.link().callback(|_|Msg::Undo)}>{"Undo (U)"}</button><button class="small-btn" onclick={ctx.link().callback(|_|Msg::Mute)}>{if self.sounds.muted {"Sound: Off"} else {"Sound: On"}}</button></section>
                    <section class="panel-card history-card"><h3>{"Move history"}</h3><div id="move-log" aria-live="polite">{if g.log.is_empty(){html!{<p class="dim">{"No moves yet"}</p>}}else{g.log.iter().enumerate().map(|(i,e)|html!{<div>{e.notation(i)}</div>}).collect::<Html>()}}</div></section>
                    <div class="panel-hints">{"F: Flip board · U: Undo"}<br/>{"M: Sound · ESC: Menu"}</div><button class="small-btn menu-return" onclick={ctx.link().callback(|_|Msg::Menu)}>{"Menu"}</button>
                    </aside>
                    {if let Some(winner)=g.outcome {html!{<div class="overlay"><button class="game-over-card" onclick={ctx.link().callback(|_|Msg::Restart)}><strong class={classes!("game-over-title",match winner{1=>"blue-text",2=>"red-text",_=>"gold-text"})}>{match winner {1=>"Blue Wins!",2=>"Red Wins!",_=>"Draw!"}}</strong><span>{"Click to play again · ESC for menu"}</span></button></div>}}else{Html::default()}}
                </main>}
            }
        };
        html! {<>{view}{if let Some(error)=&self.error {html!{<div class="overlay error-overlay" role="alert"><section class="error-card"><h2>{"The game needs your attention"}</h2><p>{error}</p><div class="error-actions">{self.button(ctx,"Retry engine",||Msg::Retry)}{self.button(ctx,"Return to menu",||Msg::Menu)}</div></section></div>}}else{Html::default()}}</>}
    }
}
fn rules() -> Html {
    html! {<section class="panel-card rules-panel"><h3>{"How to play"}</h3><p>{"Enter the enemy DEN or capture all enemy pieces to win. Select a piece, then a highlighted square. White dots are quiet moves; red rings are captures."}</p><p>{"Ranks: Elephant 8 · Lion 7 · Tiger 6 · Leopard 5 · Wolf 4 · Dog 3 · Cat 2 · Rat 1. A piece captures an enemy of equal or lower rank."}</p><p>{"The Rat can capture an Elephant from land; the Elephant cannot capture a Rat. Only Rats swim. A Rat in water can only be captured by another Rat in water."}</p><p>{"The Lion jumps up to 3 water squares; the Tiger jumps up to 2. Any Rat in the river blocks a jump. Enemy traps reduce your piece's rank to zero. You cannot enter your own den."}</p><p>{"Threefold repetition or the 400-turn limit is a draw. A player with no legal moves loses. Undo takes back your last move pair in Human vs AI."}</p></section>}
}
