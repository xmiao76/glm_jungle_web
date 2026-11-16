use crate::animals::*;
use jungle_core::{Tables, game::Game, position::*};
use std::f64::consts::PI;
use wasm_bindgen::{JsCast, JsValue};
use web_sys::{CanvasRenderingContext2d as Ctx, HtmlCanvasElement};
const FONT: &str = "'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif";
fn circle(c: &Ctx, x: f64, y: f64, r: f64) {
    c.begin_path();
    let _ = c.arc(x, y, r.max(0.0), 0.0, PI * 2.0);
}
fn round(c: &Ctx, x: f64, y: f64, w: f64, h: f64, r: f64) {
    c.begin_path();
    let _ = c.round_rect_with_f64(x, y, w, h, r);
}
fn shade(hex: &str, amount: i32) -> String {
    let mut out = String::from("#");
    for i in 0..3 {
        let v = i32::from_str_radix(&hex[1 + i * 2..3 + i * 2], 16).unwrap();
        out.push_str(&format!("{:02x}", (v + amount).clamp(0, 255)));
    }
    out
}
fn canvas(size: u32) -> Result<(HtmlCanvasElement, Ctx), JsValue> {
    let c = web_sys::window()
        .unwrap()
        .document()
        .unwrap()
        .create_element("canvas")?
        .dyn_into::<HtmlCanvasElement>()?;
    c.set_width(size);
    c.set_height(size);
    let ctx = c
        .get_context("2d")?
        .ok_or("Canvas 2D is unavailable")?
        .dyn_into::<Ctx>()?;
    Ok((c, ctx))
}
pub fn token(piece: u8, side: u8, size: u32) -> Result<HtmlCanvasElement, JsValue> {
    let (surface, c) = canvas(size)?;
    let sz = size as f64;
    let x = sz / 2.0 - 1.0;
    let y = sz / 2.0 - 2.0;
    let r = sz / 2.0 - 4.0;
    let (dark, bg, light, animal) = if side == BLUE {
        ("#1c3482", "#426ee0", "#96b9ff", "#e8eeff")
    } else {
        ("#801c1c", "#d44242", "#ff9696", "#ffeeee")
    };
    circle(&c, x, y, r);
    c.set_fill_style_str(dark);
    c.fill();
    let gradient = c.create_radial_gradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.05)?;
    gradient.add_color_stop(0.0, &format!("{light}aa"))?;
    gradient.add_color_stop(0.25, bg)?;
    gradient.add_color_stop(1.0, dark)?;
    circle(&c, x, y, r - 2.0);
    c.set_fill_style_canvas_gradient(&gradient);
    c.fill();
    let gradient = c.create_radial_gradient(x, y - r * 0.4, r * 0.4, x, y + r * 0.2, r)?;
    gradient.add_color_stop(0.0, "rgba(0,0,0,0)")?;
    gradient.add_color_stop(1.0, "rgba(0,0,0,.32)")?;
    circle(&c, x, y, r - 2.0);
    c.set_fill_style_canvas_gradient(&gradient);
    c.fill();
    c.save();
    circle(&c, x, y, r - 2.0);
    c.clip();
    let ay = y - r * 0.22;
    let area = r * 0.74;
    let draw = match piece {
        1 => draw_rat,
        2 => draw_cat,
        3 => draw_dog,
        4 => draw_wolf,
        5 => draw_leopard,
        6 => draw_tiger,
        7 => draw_lion,
        _ => draw_elephant,
    };
    draw(&c, x, ay, area, animal);
    let gradient = c.create_radial_gradient(
        x - r * 0.35,
        ay - r * 0.3,
        0.0,
        x - r * 0.35,
        ay - r * 0.3,
        r * 0.9,
    )?;
    gradient.add_color_stop(0.0, "rgba(255,255,255,.14)")?;
    gradient.add_color_stop(1.0, "rgba(255,255,255,0)")?;
    c.set_fill_style_canvas_gradient(&gradient);
    c.fill_rect(x - r, ay - r, r * 2.0, r * 2.0);
    let top = y + r * 0.12;
    let gradient = c.create_linear_gradient(0.0, top, 0.0, y + r);
    gradient.add_color_stop(0.0, dark)?;
    gradient.add_color_stop(1.0, "rgba(0,0,0,.55)")?;
    c.set_fill_style_canvas_gradient(&gradient);
    c.fill_rect(x - r, top, r * 2.0, r * 2.0);
    c.set_fill_style_str("rgba(255,255,255,.22)");
    c.fill_rect(x - r, top, r * 2.0, (sz / 90.0).max(1.0));
    let label = NAMES[piece as usize];
    let ty = y + r * 0.44;
    let mut fs = (sz * if label.len() <= 4 { 0.34 } else { 0.26 }).max(12.0);
    let mut candidate = fs;
    while candidate >= 7.0 {
        c.set_font(&format!("bold {candidate}px {FONT}"));
        let dx = c.measure_text(label)?.width() / 2.0;
        let bottom = ty - y + candidate / 2.0;
        if ty - candidate / 2.0 >= top
            && dx * dx + bottom * bottom <= (r - (r / 8.0).max(2.0)).powi(2)
        {
            fs = candidate;
            break;
        }
        candidate -= 1.0;
    }
    c.set_font(&format!("bold {fs}px {FONT}"));
    c.set_text_align("center");
    c.set_text_baseline("middle");
    c.set_fill_style_str("rgba(0,0,0,.6)");
    c.fill_text(label, x + 1.0, ty + 1.0)?;
    c.set_fill_style_str("white");
    c.fill_text(label, x, ty)?;
    c.restore();
    circle(&c, x, y, r);
    c.set_stroke_style_str(dark);
    c.set_line_width(3.0);
    c.stroke();
    c.begin_path();
    c.arc(x, y, r - 3.0, PI * 0.75, PI * 1.75)?;
    c.set_stroke_style_str("rgba(255,255,255,.55)");
    c.set_line_width((sz / 80.0).max(1.0));
    c.set_line_cap("round");
    c.stroke();
    c.begin_path();
    c.arc(x, y, r - 3.0, -PI * 0.25, PI * 0.75)?;
    c.set_stroke_style_str("rgba(0,0,0,.35)");
    c.set_line_width(1.0);
    c.stroke();
    Ok(surface)
}
pub struct Renderer {
    canvas: HtmlCanvasElement,
    c: Ctx,
    pub cell: f64,
    pub ox: f64,
    pub oy: f64,
    tokens: Vec<HtmlCanvasElement>,
}
impl Renderer {
    pub fn icon_urls(&self) -> Vec<String> {
        self.tokens
            .iter()
            .map(|c| c.to_data_url().unwrap_or_default())
            .collect()
    }
    pub fn new(canvas: HtmlCanvasElement) -> Result<Self, JsValue> {
        let c = canvas
            .get_context("2d")?
            .ok_or("Canvas 2D is unavailable")?
            .dyn_into::<Ctx>()?;
        let mut tokens = Vec::new();
        for side in 1..=2 {
            for p in 1..=8 {
                tokens.push(token(p, side, 160)?);
            }
        }
        Ok(Self {
            canvas,
            c,
            cell: 60.0,
            ox: 0.0,
            oy: 0.0,
            tokens,
        })
    }
    pub fn square(&self, x: f64, y: f64, flipped: bool) -> Option<usize> {
        let col = ((x - self.ox - 4.0) / self.cell).floor() as i32;
        let row = ((y - self.oy - 4.0) / self.cell).floor() as i32;
        if !(0..7).contains(&col) || !(0..9).contains(&row) {
            None
        } else {
            let s = (row * 7 + col) as usize;
            Some(if flipped { 62 - s } else { s })
        }
    }
    fn xy(&self, s: usize, flip: bool) -> (f64, f64) {
        let s = if flip { 62 - s } else { s };
        (
            self.ox + 4.0 + (s % 7) as f64 * self.cell,
            self.oy + 4.0 + (s / 7) as f64 * self.cell,
        )
    }
    pub fn draw(
        &mut self,
        g: &Game,
        t: &Tables,
        now: f64,
        pending: Option<(i32, f64)>,
    ) -> Result<(), JsValue> {
        let rect = self.canvas.get_bounding_client_rect();
        let (w, h) = (rect.width(), rect.height());
        let dpr = web_sys::window().unwrap().device_pixel_ratio().max(1.0);
        let width = (w * dpr).floor().max(1.0) as u32;
        let height = (h * dpr).floor().max(1.0) as u32;
        if self.canvas.width() != width || self.canvas.height() != height {
            self.canvas.set_width(width);
            self.canvas.set_height(height);
        }
        self.cell = ((w - 32.0) / 7.0).min((h - 82.0) / 9.0).floor().max(16.0);
        let cs = self.cell;
        self.ox = ((w - cs * 7.0 - 8.0) / 2.0).max(0.0);
        self.oy = ((h - cs * 9.0 - 8.0) / 2.0).max(0.0);
        // Useful for browser hit testing and accessibility tooling; no game logic in JS.
        self.canvas
            .set_attribute("data-cell-size", &cs.to_string())?;
        self.canvas
            .set_attribute("data-origin-x", &(self.ox + 4.0).to_string())?;
        self.canvas
            .set_attribute("data-origin-y", &(self.oy + 4.0).to_string())?;
        self.canvas
            .set_attribute("data-flipped", &g.flipped.to_string())?;
        let c = &self.c;
        c.set_transform(dpr, 0.0, 0.0, dpr, 0.0, 0.0)?;
        c.set_fill_style_str("#181c26");
        c.fill_rect(0.0, 0.0, w, h);
        c.save();
        c.set_shadow_color("rgba(5,7,11,.6)");
        c.set_shadow_blur((cs / 3.0).max(16.0));
        c.set_shadow_offset_y((cs / 16.0).max(4.0));
        c.set_fill_style_str("#0d1017");
        round(c, self.ox, self.oy, cs * 7.0 + 8.0, cs * 9.0 + 8.0, 14.0);
        c.fill();
        c.restore();
        let grad = c.create_linear_gradient(0.0, self.oy, 0.0, self.oy + cs * 9.0);
        grad.add_color_stop(0.0, "#2b3243")?;
        grad.add_color_stop(1.0, "#1a1f2b")?;
        c.set_fill_style_canvas_gradient(&grad);
        round(
            c,
            self.ox + 2.0,
            self.oy + 2.0,
            cs * 7.0 + 4.0,
            cs * 9.0 + 4.0,
            12.0,
        );
        c.fill();
        for (s, &terrain) in TERRAIN.iter().enumerate() {
            let (x, y) = self.xy(s, g.flipped);
            let odd = (s / 7 + s % 7) % 2 == 1;
            match terrain {
                0 => {
                    c.set_fill_style_str(if odd { "#829d5c" } else { "#8ca864" });
                    c.fill_rect(x, y, cs, cs);
                    let gr = c.create_radial_gradient(
                        x + cs * 0.5,
                        y + cs * 0.4,
                        cs * 0.15,
                        x + cs * 0.5,
                        y + cs * 0.55,
                        cs * 0.78,
                    )?;
                    gr.add_color_stop(0.0, "rgba(255,255,235,.08)")?;
                    gr.add_color_stop(0.55, "rgba(0,0,0,0)")?;
                    gr.add_color_stop(
                        1.0,
                        if odd {
                            "rgba(0,0,0,.17)"
                        } else {
                            "rgba(0,0,0,.10)"
                        },
                    )?;
                    c.set_fill_style_canvas_gradient(&gr);
                    c.fill_rect(x, y, cs, cs);
                    c.set_stroke_style_str("rgba(0,0,0,.06)");
                    c.set_line_width(1.0);
                    for i in 0..5 {
                        let gx = x + cs * (0.15 + 0.18 * i as f64) + (i * 37 % 5) as f64;
                        let gy = y + cs * (0.3 + (i * 53 % 10) as f64 / 28.0);
                        c.begin_path();
                        c.move_to(gx, gy + cs * 0.1);
                        c.line_to(gx + cs * 0.02, gy);
                        c.stroke();
                    }
                }
                1 => {
                    let base = if odd { "#386594" } else { "#3e6e9e" };
                    let gr = c.create_linear_gradient(x, y, x, y + cs);
                    gr.add_color_stop(0.0, &shade(base, 14))?;
                    gr.add_color_stop(0.55, base)?;
                    gr.add_color_stop(1.0, &shade(base, -22))?;
                    c.set_fill_style_canvas_gradient(&gr);
                    c.fill_rect(x, y, cs, cs);
                    c.set_stroke_style_str("#6e9ecd");
                    c.set_line_width((cs / 30.0).floor().max(1.0));
                    c.set_line_cap("round");
                    for wy in 0..2 {
                        c.begin_path();
                        for step in 0..=8 {
                            let dx = cs * step as f64 / 8.0;
                            let yy = y
                                + cs * (0.32 + wy as f64 * 0.34)
                                + (now / 900.0 + s as f64 / 7.0 * 0.5 + dx * 0.07 + wy as f64)
                                    .sin()
                                    * cs
                                    * 0.03;
                            if step == 0 {
                                c.move_to(x + dx, yy)
                            } else {
                                c.line_to(x + dx, yy)
                            }
                        }
                        c.stroke();
                    }
                }
                2 | 3 => {
                    let base = if terrain == 2 { "#c4944c" } else { "#bc8c46" };
                    c.set_fill_style_str(&shade(base, -10));
                    c.fill_rect(x, y, cs, cs);
                    c.set_stroke_style_str("rgba(0,0,0,.28)");
                    c.set_line_width((cs / 26.0).max(2.0));
                    c.stroke_rect(x + 1.5, y + 1.5, cs - 3.0, cs - 3.0);
                    let m = (cs * 0.22).floor();
                    let lw = (cs / 18.0).floor().max(2.0);
                    c.set_line_cap("round");
                    for (a, b, d, e) in [
                        (x + m, y + m, x + cs - m, y + cs - m),
                        (x + cs - m, y + m, x + m, y + cs - m),
                    ] {
                        c.set_stroke_style_str(&shade(base, -55));
                        c.set_line_width(lw);
                        c.begin_path();
                        c.move_to(a, b);
                        c.line_to(d, e);
                        c.stroke();
                        c.set_stroke_style_str(&shade(base, 30));
                        c.set_line_width((lw / 3.0).max(1.0));
                        c.begin_path();
                        c.move_to(a - lw * 0.18, b - lw * 0.18);
                        c.line_to(d - lw * 0.18, e - lw * 0.18);
                        c.stroke();
                    }
                    c.set_fill_style_str(&shade(base, -40));
                    for dx in [m * 0.5, cs - m * 0.5] {
                        for dy in [m * 0.5, cs - m * 0.5] {
                            circle(c, x + dx, y + dy, (cs / 34.0).max(1.5));
                            c.fill();
                        }
                    }
                }
                _ => {
                    let base = if terrain == 4 { "#344994" } else { "#9e3030" };
                    c.set_fill_style_str(base);
                    c.fill_rect(x, y, cs, cs);
                    let m = (cs / 12.0).floor().max(2.0);
                    let cx = x + cs / 2.0;
                    let cy = y + cs / 2.0;
                    let gr =
                        c.create_radial_gradient(cx, cy - cs * 0.1, cs * 0.1, cx, cy, cs * 0.7)?;
                    gr.add_color_stop(0.0, &shade(base, -8))?;
                    gr.add_color_stop(1.0, &shade(base, -26))?;
                    c.set_fill_style_canvas_gradient(&gr);
                    round(c, x + m, y + m, cs - 2.0 * m, cs - 2.0 * m, cs / 6.0);
                    c.fill();
                    let r = (cs * 0.28).floor();
                    let ay = cy + cs * 0.08;
                    c.set_fill_style_str("#080b12");
                    circle(c, cx, ay, r);
                    c.fill();
                    c.fill_rect(cx - r, ay, r * 2.0, r);
                    c.save();
                    c.set_shadow_color(&shade(base, 55));
                    c.set_shadow_blur((cs / 10.0).max(4.0));
                    c.set_stroke_style_str(&shade(base, 55));
                    c.set_line_width((cs / 20.0).floor().max(2.0));
                    c.begin_path();
                    c.arc(cx, ay - r, r, 0.0, PI)?;
                    c.stroke();
                    c.restore();
                    c.set_font(&format!("bold {}px {FONT}", (cs * 0.2).max(10.0)));
                    c.set_text_align("center");
                    c.set_text_baseline("middle");
                    c.set_fill_style_str("white");
                    c.fill_text("DEN", cx, cy + cs * 0.3)?;
                }
            }
        }
        if let Some(mv) = g.last {
            for s in [from(mv), to(mv)] {
                let (x, y) = self.xy(s, g.flipped);
                c.set_fill_style_str("#ffd05428");
                round(c, x, y, cs, cs, cs / 6.0);
                c.fill();
                c.set_stroke_style_str("#ffd05496");
                c.set_line_width(2.0);
                c.stroke();
            }
        }
        if let Some(s) = g.selected {
            let (x, y) = self.xy(s, g.flipped);
            c.set_fill_style_str("#ffd05440");
            round(c, x + 2.0, y + 2.0, cs - 4.0, cs - 4.0, cs / 6.0);
            c.fill();
            c.set_stroke_style_str("#ffd054");
            c.set_line_width(3.0);
            c.stroke();
        }
        for s in 0..SQ {
            let code = g.position.grid[s];
            if code == 0 || pending.is_some_and(|(m, _)| from(m) == s) {
                continue;
            }
            let (x, y) = self.xy(s, g.flipped);
            self.piece(code, x, y)?;
        }
        if let Some((mv, start)) = pending {
            let f = self.xy(from(mv), g.flipped);
            let d = self.xy(to(mv), g.flipped);
            let k = ((now - start) / 180.0).clamp(0.0, 1.0);
            let k = k * k * (3.0 - 2.0 * k);
            self.piece(
                g.position.grid[from(mv)],
                f.0 + (d.0 - f.0) * k,
                f.1 + (d.1 - f.1) * k,
            )?;
        }
        if let Some(selected) = g.selected {
            for mv in g.legal(t).into_iter().filter(|&m| from(m) == selected) {
                let (x, y) = self.xy(to(mv), g.flipped);
                if cap(mv) != 0 {
                    c.set_stroke_style_str("#e8483d");
                    c.set_line_width(3.5);
                    round(c, x + 2.0, y + 2.0, cs - 4.0, cs - 4.0, cs / 6.0);
                    c.stroke();
                } else {
                    let r = (cs / 9.0).max(4.0);
                    circle(c, x + cs / 2.0, y + cs / 2.0, r * 1.9);
                    c.set_fill_style_str("#ffffff29");
                    c.fill();
                    circle(c, x + cs / 2.0, y + cs / 2.0, r + 2.0);
                    c.set_fill_style_str("#14181ecb");
                    c.fill();
                    circle(c, x + cs / 2.0, y + cs / 2.0, r);
                    c.set_fill_style_str("#fafafaeb");
                    c.fill();
                }
            }
        }
        Ok(())
    }
    fn piece(&self, code: u8, x: f64, y: f64) -> Result<(), JsValue> {
        if code == 0 {
            return Ok(());
        }
        let margin = self.cell * 0.04;
        self.c.save();
        self.c.set_shadow_color("rgba(0,0,0,.4)");
        self.c.set_shadow_blur(self.cell / 12.0);
        self.c.set_shadow_offset_y(self.cell / 20.0);
        let result = self.c.draw_image_with_html_canvas_element_and_dw_and_dh(
            &self.tokens[(code - 1) as usize],
            x + margin,
            y + margin,
            self.cell - margin * 2.0,
            self.cell - margin * 2.0,
        );
        self.c.restore();
        result
    }
}
