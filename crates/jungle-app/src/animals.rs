//! Procedural animal artwork ported from the original Canvas renderer.
#![allow(non_snake_case, unused_parens)]
use web_sys::CanvasRenderingContext2d;
fn shade(hex: &str, amount: f64) -> String {
    let mut c = [0u8; 3];
    for (i, v) in c.iter_mut().enumerate() {
        *v = (u8::from_str_radix(&hex[1 + i * 2..3 + i * 2], 16).unwrap() as f64 + amount)
            .clamp(0.0, 255.0) as u8;
    }
    format!("#{:02x}{:02x}{:02x}", c[0], c[1], c[2])
}

pub fn draw_rat(ctx: &CanvasRenderingContext2d, cx: f64, cy: f64, r: f64, color: &str) {
    let ol = (2.0_f64).max((r / 10.0_f64).floor());
    let dk = shade(color, -60.0_f64);
    let bw = (r * 0.55_f64).floor();
    let bh = (r * 0.38_f64).floor();
    ctx.set_fill_style_str(color);
    ctx.set_stroke_style_str(&dk);
    ctx.set_line_width(ol);
    ctx.begin_path();
    let _ = ctx.ellipse(
        cx,
        (cy - (r * 0.05_f64).floor()),
        (bw / 2.0_f64),
        (bh / 2.0_f64),
        0.0_f64,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.fill();
    ctx.stroke();
    let hw = (r * 0.35_f64).floor();
    let hh = (r * 0.28_f64).floor();
    let hx = (cx + (r * 0.15_f64).floor());
    let hy = (cy - (r * 0.18_f64).floor());
    ctx.begin_path();
    let _ = ctx.ellipse(
        hx,
        hy,
        (hw / 2.0_f64),
        (hh / 2.0_f64),
        0.0_f64,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.fill();
    ctx.stroke();
    let earR = (r * 0.16_f64).floor();
    ctx.begin_path();
    let _ = ctx.arc(
        (hx - (r * 0.08_f64).floor()),
        (hy - (r * 0.2_f64).floor()),
        earR,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(color);
    ctx.fill();
    ctx.stroke();
    ctx.begin_path();
    let _ = ctx.arc(
        (hx - (r * 0.08_f64).floor()),
        (hy - (r * 0.2_f64).floor()),
        (earR / 2.0_f64),
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(&dk);
    ctx.fill();
    ctx.begin_path();
    let _ = ctx.arc(
        (hx + (r * 0.12_f64).floor()),
        (hy - (r * 0.18_f64).floor()),
        earR,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(color);
    ctx.fill();
    ctx.stroke();
    ctx.begin_path();
    let _ = ctx.arc(
        (hx + (r * 0.12_f64).floor()),
        (hy - (r * 0.18_f64).floor()),
        (earR / 2.0_f64),
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(&dk);
    ctx.fill();
    ctx.begin_path();
    let _ = ctx.arc(
        (hx + (r * 0.05_f64).floor()),
        (hy - (r * 0.02_f64).floor()),
        (2.0_f64).max((r / 14.0_f64).floor()),
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str("#1e1e1e");
    ctx.fill();
    ctx.begin_path();
    let _ = ctx.arc(
        (hx + (r * 0.16_f64).floor()),
        (hy + (r * 0.02_f64).floor()),
        (2.0_f64).max((r / 20.0_f64).floor()),
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str("#1e1e1e");
    ctx.fill();
    ctx.set_stroke_style_str(&dk);
    ctx.set_line_width((2.0_f64).max((r / 12.0_f64).floor()));
    ctx.set_line_cap("round");
    ctx.begin_path();
    ctx.move_to((cx - (r * 0.28_f64).floor()), (cy + (r * 0.1_f64).floor()));
    ctx.line_to((cx - (r * 0.42_f64).floor()), (cy + (r * 0.28_f64).floor()));
    ctx.line_to((cx - (r * 0.52_f64).floor()), (cy + (r * 0.12_f64).floor()));
    ctx.stroke();
}

pub fn draw_cat(ctx: &CanvasRenderingContext2d, cx: f64, cy: f64, r: f64, color: &str) {
    let ol = (2.0_f64).max((r / 10.0_f64).floor());
    let dk = shade(color, -60.0_f64);
    let hr = (r * 0.38_f64).floor();
    ctx.begin_path();
    let _ = ctx.arc(
        cx,
        (cy - (r * 0.05_f64).floor()),
        hr,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(color);
    ctx.fill();
    ctx.set_stroke_style_str(&dk);
    ctx.set_line_width(ol);
    ctx.stroke();
    let earH = (r * 0.28_f64).floor();
    for sign in [-1.0_f64, 1.0_f64] {
        let earX = (cx + (sign * (r * 0.22_f64).floor()));
        let earBaseY = ((cy - (r * 0.05_f64).floor()) - (hr * 0.65_f64).floor());
        ctx.begin_path();
        ctx.move_to(
            (earX - (r * 0.1_f64).floor()),
            (earBaseY + (r * 0.08_f64).floor()),
        );
        ctx.line_to(earX, ((earBaseY - earH) + (r * 0.08_f64).floor()));
        ctx.line_to(
            (earX + (r * 0.1_f64).floor()),
            (earBaseY + (r * 0.08_f64).floor()),
        );
        ctx.close_path();
        ctx.set_fill_style_str(color);
        ctx.fill();
        ctx.set_stroke_style_str(&dk);
        ctx.set_line_width(ol);
        ctx.stroke();
    }
    for sign in [-1.0_f64, 1.0_f64] {
        let ex = (cx + (sign * (r * 0.12_f64).floor()));
        let ey = (cy - (r * 0.08_f64).floor());
        let ew = (3.0_f64).max((r * 0.07_f64).floor());
        let eh = (5.0_f64).max((r * 0.12_f64).floor());
        ctx.begin_path();
        let _ = ctx.ellipse(
            ex,
            ey,
            ew,
            eh,
            0.0_f64,
            0.0_f64,
            (std::f64::consts::PI * 2.0_f64),
        );
        ctx.set_fill_style_str("#b4dc3c");
        ctx.fill();
        ctx.set_stroke_style_str(&dk);
        ctx.set_line_width(1.0_f64);
        ctx.stroke();
        ctx.begin_path();
        ctx.move_to(ex, ((ey - eh) + 1.0_f64));
        ctx.line_to(ex, ((ey + eh) - 1.0_f64));
        ctx.set_stroke_style_str("#141414");
        ctx.set_line_width((2.0_f64).max((ew / 2.0_f64).floor()));
        ctx.stroke();
    }
    let noseY = (cy + (r * 0.06_f64).floor());
    let nw = (2.0_f64).max((r / 16.0_f64).floor());
    ctx.begin_path();
    ctx.move_to(cx, (noseY - nw));
    ctx.line_to((cx - nw), (noseY + (nw / 2.0_f64).floor()));
    ctx.line_to((cx + nw), (noseY + (nw / 2.0_f64).floor()));
    ctx.close_path();
    ctx.set_fill_style_str("#ff9696");
    ctx.fill();
    ctx.set_stroke_style_str("#dcdcdc");
    ctx.set_line_width((1.0_f64).max((r / 20.0_f64).floor()));
    for dy in [-1.0_f64, 1.0_f64] {
        ctx.begin_path();
        ctx.move_to(
            (cx - (r * 0.08_f64).floor()),
            (noseY + (dy * (r * 0.03_f64).floor())),
        );
        ctx.line_to(
            (cx - (r * 0.42_f64).floor()),
            ((noseY + (dy * (r * 0.1_f64).floor())) - (r * 0.03_f64).floor()),
        );
        ctx.stroke();
        ctx.begin_path();
        ctx.move_to(
            (cx + (r * 0.08_f64).floor()),
            (noseY + (dy * (r * 0.03_f64).floor())),
        );
        ctx.line_to(
            (cx + (r * 0.42_f64).floor()),
            ((noseY + (dy * (r * 0.1_f64).floor())) - (r * 0.03_f64).floor()),
        );
        ctx.stroke();
    }
}

pub fn draw_dog(ctx: &CanvasRenderingContext2d, cx: f64, cy: f64, r: f64, color: &str) {
    let ol = (2.0_f64).max((r / 10.0_f64).floor());
    let dk = shade(color, -60.0_f64);
    let snoutColor = shade(color, 40.0_f64);
    let hr = (r * 0.36_f64).floor();
    ctx.begin_path();
    let _ = ctx.arc(
        cx,
        (cy - (r * 0.05_f64).floor()),
        hr,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(color);
    ctx.fill();
    ctx.set_stroke_style_str(&dk);
    ctx.set_line_width(ol);
    ctx.stroke();
    let sr = (r * 0.18_f64).floor();
    ctx.begin_path();
    let _ = ctx.arc(
        cx,
        (cy + (r * 0.08_f64).floor()),
        sr,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(&snoutColor);
    ctx.fill();
    ctx.set_stroke_style_str(&dk);
    ctx.stroke();
    let earW = (r * 0.18_f64).floor();
    let earH = (r * 0.32_f64).floor();
    for sign in [-1.0_f64, 1.0_f64] {
        let ex = (cx + (sign * (r * 0.28_f64).floor()));
        let ey = (cy - (r * 0.12_f64).floor());
        ctx.begin_path();
        let _ = ctx.ellipse(
            ex,
            ey,
            (earW / 2.0_f64),
            (earH / 2.0_f64),
            0.0_f64,
            0.0_f64,
            (std::f64::consts::PI * 2.0_f64),
        );
        ctx.set_fill_style_str(color);
        ctx.fill();
        ctx.set_stroke_style_str(&dk);
        ctx.set_line_width(ol);
        ctx.stroke();
    }
    for sign in [-1.0_f64, 1.0_f64] {
        let ex = (cx + (sign * (r * 0.12_f64).floor()));
        let ey = (cy - (r * 0.1_f64).floor());
        let er = (3.0_f64).max((r * 0.08_f64).floor());
        ctx.begin_path();
        let _ = ctx.arc(ex, ey, er, 0.0_f64, (std::f64::consts::PI * 2.0_f64));
        ctx.set_fill_style_str("#ffffff");
        ctx.fill();
        ctx.begin_path();
        let _ = ctx.arc(
            ex,
            ey,
            (2.0_f64).max((er / 2.0_f64).floor()),
            0.0_f64,
            (std::f64::consts::PI * 2.0_f64),
        );
        ctx.set_fill_style_str("#1e1e1e");
        ctx.fill();
    }
    let nw = (3.0_f64).max((r * 0.1_f64).floor());
    ctx.begin_path();
    let _ = ctx.ellipse(
        cx,
        (cy + (r * 0.02_f64).floor()),
        nw,
        (nw / 2.0_f64),
        0.0_f64,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str("#1e1e1e");
    ctx.fill();
    let tw = (3.0_f64).max((r * 0.07_f64).floor());
    let th = (4.0_f64).max((r * 0.12_f64).floor());
    ctx.begin_path();
    let _ = ctx.ellipse(
        cx,
        (cy + (r * 0.14_f64).floor()),
        (tw / 2.0_f64),
        (th / 2.0_f64),
        0.0_f64,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str("#ff7878");
    ctx.fill();
    ctx.set_stroke_style_str("#c85050");
    ctx.set_line_width(1.0_f64);
    ctx.stroke();
}

pub fn draw_wolf(ctx: &CanvasRenderingContext2d, cx: f64, cy: f64, r: f64, color: &str) {
    let ol = (2.0_f64).max((r / 10.0_f64).floor());
    let dk = shade(color, -60.0_f64);
    let snoutColor = shade(color, 30.0_f64);
    let hr = (r * 0.38_f64).floor();
    ctx.begin_path();
    let _ = ctx.arc(
        cx,
        (cy - (r * 0.02_f64).floor()),
        hr,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(color);
    ctx.fill();
    ctx.set_stroke_style_str(&dk);
    ctx.set_line_width(ol);
    ctx.stroke();
    ctx.begin_path();
    ctx.move_to((cx - (r * 0.12_f64).floor()), (cy + (r * 0.08_f64).floor()));
    ctx.line_to((cx + (r * 0.12_f64).floor()), (cy + (r * 0.08_f64).floor()));
    ctx.line_to(cx, (cy + (r * 0.28_f64).floor()));
    ctx.close_path();
    ctx.set_fill_style_str(&snoutColor);
    ctx.fill();
    ctx.set_stroke_style_str(&dk);
    ctx.set_line_width(ol);
    ctx.stroke();
    for sign in [-1.0_f64, 1.0_f64] {
        let earX = (cx + (sign * (r * 0.22_f64).floor()));
        let earBaseY = ((cy - (r * 0.02_f64).floor()) - (hr * 0.7_f64).floor());
        ctx.begin_path();
        ctx.move_to(
            (earX - (sign * (r * 0.06_f64).floor())),
            (earBaseY + (r * 0.1_f64).floor()),
        );
        ctx.line_to(earX, (earBaseY - (r * 0.25_f64).floor()));
        ctx.line_to(
            (earX + (sign * (r * 0.06_f64).floor())),
            (earBaseY + (r * 0.1_f64).floor()),
        );
        ctx.close_path();
        ctx.set_fill_style_str(color);
        ctx.fill();
        ctx.set_stroke_style_str(&dk);
        ctx.stroke();
    }
    for sign in [-1.0_f64, 1.0_f64] {
        let ex = (cx + (sign * (r * 0.14_f64).floor()));
        let ey = (cy - (r * 0.08_f64).floor());
        let er = (3.0_f64).max((r * 0.07_f64).floor());
        ctx.begin_path();
        let _ = ctx.arc(ex, ey, er, 0.0_f64, (std::f64::consts::PI * 2.0_f64));
        ctx.set_fill_style_str("#ffc832");
        ctx.fill();
        ctx.begin_path();
        let _ = ctx.arc(
            ex,
            ey,
            (2.0_f64).max((er / 2.0_f64).floor()),
            0.0_f64,
            (std::f64::consts::PI * 2.0_f64),
        );
        ctx.set_fill_style_str("#141414");
        ctx.fill();
    }
    let nw = (3.0_f64).max((r * 0.09_f64).floor());
    ctx.begin_path();
    let _ = ctx.ellipse(
        cx,
        (cy + (r * 0.08_f64).floor()),
        nw,
        (nw / 2.0_f64),
        0.0_f64,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str("#141414");
    ctx.fill();
}

pub fn draw_leopard(ctx: &CanvasRenderingContext2d, cx: f64, cy: f64, r: f64, color: &str) {
    let ol = (2.0_f64).max((r / 10.0_f64).floor());
    let dk = shade(color, -60.0_f64);
    let spotRing = shade(color, -50.0_f64);
    let hr = (r * 0.4_f64).floor();
    ctx.begin_path();
    let _ = ctx.arc(
        cx,
        (cy - (r * 0.02_f64).floor()),
        hr,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(color);
    ctx.fill();
    ctx.set_stroke_style_str(&dk);
    ctx.set_line_width(ol);
    ctx.stroke();
    let earR = (r * 0.12_f64).floor();
    for sign in [-1.0_f64, 1.0_f64] {
        let earX = (cx + (sign * (r * 0.28_f64).floor()));
        let earY = ((cy - (r * 0.02_f64).floor()) - (hr * 0.7_f64).floor());
        ctx.begin_path();
        let _ = ctx.arc(earX, earY, earR, 0.0_f64, (std::f64::consts::PI * 2.0_f64));
        ctx.set_fill_style_str(color);
        ctx.fill();
        ctx.set_stroke_style_str(&dk);
        ctx.stroke();
        ctx.begin_path();
        let _ = ctx.arc(
            earX,
            earY,
            (earR / 2.0_f64),
            0.0_f64,
            (std::f64::consts::PI * 2.0_f64),
        );
        ctx.set_fill_style_str(&dk);
        ctx.fill();
    }
    let spots = [
        [-0.18_f64, -0.08_f64],
        [0.18_f64, -0.08_f64],
        [-0.1_f64, 0.12_f64],
        [0.1_f64, 0.12_f64],
        [0.0_f64, -0.22_f64],
    ];
    let sr = (3.0_f64).max((r * 0.07_f64).floor());
    for [sx, sy] in spots {
        let px = (cx + (r * sx).floor());
        let py = ((cy - (r * 0.02_f64).floor()) + (r * sy).floor());
        ctx.begin_path();
        let _ = ctx.arc(px, py, sr, 0.0_f64, (std::f64::consts::PI * 2.0_f64));
        ctx.set_stroke_style_str(&spotRing);
        ctx.set_line_width((1.0_f64).max((sr / 3.0_f64).floor()));
        ctx.stroke();
    }
    for sign in [-1.0_f64, 1.0_f64] {
        let ex = (cx + (sign * (r * 0.12_f64).floor()));
        let ey = (cy - (r * 0.08_f64).floor());
        let er = (3.0_f64).max((r * 0.06_f64).floor());
        ctx.begin_path();
        let _ = ctx.arc(ex, ey, er, 0.0_f64, (std::f64::consts::PI * 2.0_f64));
        ctx.set_fill_style_str("#ffdc50");
        ctx.fill();
        ctx.begin_path();
        let _ = ctx.arc(
            ex,
            ey,
            (2.0_f64).max((er / 2.0_f64).floor()),
            0.0_f64,
            (std::f64::consts::PI * 2.0_f64),
        );
        ctx.set_fill_style_str("#141414");
        ctx.fill();
    }
    let nw = (2.0_f64).max((r / 16.0_f64).floor());
    ctx.begin_path();
    ctx.move_to(cx, (cy + (r * 0.08_f64).floor()));
    ctx.line_to((cx - nw), (cy + (r * 0.13_f64).floor()));
    ctx.line_to((cx + nw), (cy + (r * 0.13_f64).floor()));
    ctx.close_path();
    ctx.set_fill_style_str("#1e1e1e");
    ctx.fill();
}

pub fn draw_tiger(ctx: &CanvasRenderingContext2d, cx: f64, cy: f64, r: f64, color: &str) {
    let ol = (2.0_f64).max((r / 10.0_f64).floor());
    let dk = shade(color, -70.0_f64);
    let stripe = shade(color, -80.0_f64);
    let hr = (r * 0.42_f64).floor();
    ctx.begin_path();
    let _ = ctx.arc(
        cx,
        (cy - (r * 0.02_f64).floor()),
        hr,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(color);
    ctx.fill();
    ctx.set_stroke_style_str(&dk);
    ctx.set_line_width(ol);
    ctx.stroke();
    let earR = (r * 0.13_f64).floor();
    for sign in [-1.0_f64, 1.0_f64] {
        let earX = (cx + (sign * (r * 0.3_f64).floor()));
        let earY = ((cy - (r * 0.02_f64).floor()) - (hr * 0.7_f64).floor());
        ctx.begin_path();
        let _ = ctx.arc(earX, earY, earR, 0.0_f64, (std::f64::consts::PI * 2.0_f64));
        ctx.set_fill_style_str(color);
        ctx.fill();
        ctx.set_stroke_style_str(&dk);
        ctx.stroke();
        let innerColor = shade(color, 50.0_f64);
        ctx.begin_path();
        let _ = ctx.arc(
            earX,
            earY,
            (earR / 2.0_f64),
            0.0_f64,
            (std::f64::consts::PI * 2.0_f64),
        );
        ctx.set_fill_style_str(&innerColor);
        ctx.fill();
    }
    let sw = (2.0_f64).max((r / 12.0_f64).floor());
    ctx.set_stroke_style_str(&stripe);
    ctx.set_line_width(sw);
    for sx in [-0.1_f64, 0.0_f64, 0.1_f64] {
        let x = ((cx + (r * sx).floor()) - (sw / 2.0_f64).floor());
        ctx.begin_path();
        ctx.move_to(x, (cy - (r * 0.2_f64).floor()));
        ctx.line_to(x, (cy - (r * 0.08_f64).floor()));
        ctx.stroke();
    }
    for sign in [-1.0_f64, 1.0_f64] {
        let x1 = (cx + (sign * (r * 0.15_f64).floor()));
        let x2 = (cx + (sign * (r * 0.38_f64).floor()));
        ctx.begin_path();
        ctx.move_to(x1, cy);
        ctx.line_to(x2, (cy + (r * 0.05_f64).floor()));
        ctx.stroke();
    }
    for sign in [-1.0_f64, 1.0_f64] {
        let ex = (cx + (sign * (r * 0.14_f64).floor()));
        let ey = (cy - (r * 0.08_f64).floor());
        let er = (3.0_f64).max((r * 0.07_f64).floor());
        ctx.begin_path();
        let _ = ctx.arc(ex, ey, er, 0.0_f64, (std::f64::consts::PI * 2.0_f64));
        ctx.set_fill_style_str("#ffc832");
        ctx.fill();
        ctx.begin_path();
        let _ = ctx.arc(
            ex,
            ey,
            (2.0_f64).max((er / 2.0_f64).floor()),
            0.0_f64,
            (std::f64::consts::PI * 2.0_f64),
        );
        ctx.set_fill_style_str("#141414");
        ctx.fill();
    }
    let nw = (3.0_f64).max((r * 0.1_f64).floor());
    ctx.begin_path();
    let _ = ctx.ellipse(
        cx,
        (cy + (r * 0.06_f64).floor()),
        nw,
        (nw / 2.0_f64),
        0.0_f64,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str("#ff8c8c");
    ctx.fill();
    ctx.set_stroke_style_str(&dk);
    ctx.set_line_width(1.0_f64);
    ctx.stroke();
}

pub fn draw_lion(ctx: &CanvasRenderingContext2d, cx: f64, cy: f64, r: f64, color: &str) {
    let ol = (2.0_f64).max((r / 10.0_f64).floor());
    let dk = shade(color, -60.0_f64);
    let mane = shade(color, 40.0_f64);
    let maneDark = shade(color, -20.0_f64);
    let maneR = (r * 0.48_f64).floor();
    let maneCy = (cy - (r * 0.02_f64).floor());
    let numSpikes = 12.0_f64;
    for i_index in 0..numSpikes as usize {
        let i = i_index as f64;
        let angle = (((i * 2.0_f64) * std::f64::consts::PI) / numSpikes);
        let a1 = (angle - 0.15_f64);
        let a2 = angle;
        let a3 = (angle + 0.15_f64);
        let outer = maneR;
        let inner = (maneR * 0.6_f64);
        ctx.begin_path();
        ctx.move_to(
            (cx + (inner * (a1).cos()).floor()),
            (maneCy + (inner * (a1).sin()).floor()),
        );
        ctx.line_to(
            (cx + (outer * (a2).cos()).floor()),
            (maneCy + (outer * (a2).sin()).floor()),
        );
        ctx.line_to(
            (cx + (inner * (a3).cos()).floor()),
            (maneCy + (inner * (a3).sin()).floor()),
        );
        ctx.close_path();
        ctx.set_fill_style_str(if ((i % 2.0_f64) == 0.0_f64) {
            &mane
        } else {
            &maneDark
        });
        ctx.fill();
    }
    ctx.begin_path();
    let _ = ctx.arc(
        cx,
        maneCy,
        (maneR * 0.55_f64).floor(),
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(&mane);
    ctx.fill();
    let hr = (r * 0.26_f64).floor();
    ctx.begin_path();
    let _ = ctx.arc(cx, maneCy, hr, 0.0_f64, (std::f64::consts::PI * 2.0_f64));
    ctx.set_fill_style_str(color);
    ctx.fill();
    ctx.set_stroke_style_str(&dk);
    ctx.set_line_width(ol);
    ctx.stroke();
    let earR = (r * 0.07_f64).floor();
    ctx.begin_path();
    let _ = ctx.arc(
        (cx - (r * 0.16_f64).floor()),
        (maneCy - (r * 0.16_f64).floor()),
        earR,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(color);
    ctx.fill();
    ctx.begin_path();
    let _ = ctx.arc(
        (cx + (r * 0.16_f64).floor()),
        (maneCy - (r * 0.16_f64).floor()),
        earR,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(color);
    ctx.fill();
    for sign in [-1.0_f64, 1.0_f64] {
        let ex = (cx + (sign * (r * 0.09_f64).floor()));
        let ey = (maneCy - (r * 0.04_f64).floor());
        let er = (3.0_f64).max((r * 0.06_f64).floor());
        ctx.begin_path();
        let _ = ctx.arc(ex, ey, er, 0.0_f64, (std::f64::consts::PI * 2.0_f64));
        ctx.set_fill_style_str("#c8aa3c");
        ctx.fill();
        ctx.begin_path();
        let _ = ctx.arc(
            ex,
            ey,
            (2.0_f64).max((er / 2.0_f64).floor()),
            0.0_f64,
            (std::f64::consts::PI * 2.0_f64),
        );
        ctx.set_fill_style_str("#141414");
        ctx.fill();
    }
    let nw = (3.0_f64).max((r * 0.08_f64).floor());
    ctx.begin_path();
    ctx.move_to(cx, (maneCy + (r * 0.06_f64).floor()));
    ctx.line_to((cx - nw), (maneCy + (r * 0.1_f64).floor()));
    ctx.line_to((cx + nw), (maneCy + (r * 0.1_f64).floor()));
    ctx.close_path();
    ctx.set_fill_style_str("#323232");
    ctx.fill();
    ctx.begin_path();
    let _ = ctx.arc(
        cx,
        maneCy,
        (maneR * 0.55_f64).floor(),
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_stroke_style_str(&dk);
    ctx.set_line_width(ol);
    ctx.stroke();
}

pub fn draw_elephant(ctx: &CanvasRenderingContext2d, cx: f64, cy: f64, r: f64, color: &str) {
    let ol = (2.0_f64).max((r / 10.0_f64).floor());
    let dk = shade(color, -60.0_f64);
    let light = shade(color, 30.0_f64);
    let hr = (r * 0.32_f64).floor();
    ctx.begin_path();
    let _ = ctx.arc(
        cx,
        (cy - (r * 0.08_f64).floor()),
        hr,
        0.0_f64,
        (std::f64::consts::PI * 2.0_f64),
    );
    ctx.set_fill_style_str(color);
    ctx.fill();
    ctx.set_stroke_style_str(&dk);
    ctx.set_line_width(ol);
    ctx.stroke();
    let earW = (r * 0.22_f64).floor();
    let earH = (r * 0.34_f64).floor();
    for sign in [-1.0_f64, 1.0_f64] {
        let ex = (cx + (sign * (r * 0.28_f64).floor()));
        let ey = (cy - (r * 0.04_f64).floor());
        ctx.begin_path();
        let _ = ctx.ellipse(
            ex,
            ey,
            (earW / 2.0_f64),
            (earH / 2.0_f64),
            0.0_f64,
            0.0_f64,
            (std::f64::consts::PI * 2.0_f64),
        );
        ctx.set_fill_style_str(color);
        ctx.fill();
        ctx.set_stroke_style_str(&dk);
        ctx.stroke();
        let iw = (earW * 0.55_f64).floor();
        let ih = (earH * 0.55_f64).floor();
        ctx.begin_path();
        let _ = ctx.ellipse(
            ex,
            ey,
            (iw / 2.0_f64),
            (ih / 2.0_f64),
            0.0_f64,
            0.0_f64,
            (std::f64::consts::PI * 2.0_f64),
        );
        ctx.set_fill_style_str(&light);
        ctx.fill();
    }
    let tw = (4.0_f64).max((r * 0.12_f64).floor());
    let trunkTop = (cy + (r * 0.04_f64).floor());
    ctx.set_stroke_style_str(color);
    ctx.set_line_width(tw);
    ctx.set_line_cap("round");
    ctx.set_line_join("round");
    ctx.begin_path();
    ctx.move_to(cx, trunkTop);
    ctx.line_to(
        (cx + (r * 0.05_f64).floor()),
        (trunkTop + (r * 0.12_f64).floor()),
    );
    ctx.line_to(
        (cx + (r * 0.02_f64).floor()),
        (trunkTop + (r * 0.24_f64).floor()),
    );
    ctx.line_to(
        (cx - (r * 0.06_f64).floor()),
        (trunkTop + (r * 0.3_f64).floor()),
    );
    ctx.stroke();
    ctx.set_stroke_style_str(&dk);
    ctx.set_line_width((1.0_f64).max((tw / 3.0_f64).floor()));
    ctx.stroke();
    let tuskW = (2.0_f64).max((r / 10.0_f64).floor());
    let tuskColor = "#ffffe6";
    for sign in [-1.0_f64, 1.0_f64] {
        let tx = (cx + (sign * (r * 0.12_f64).floor()));
        let ty = (cy + (r * 0.04_f64).floor());
        ctx.set_stroke_style_str(tuskColor);
        ctx.set_line_width(tuskW);
        ctx.set_line_cap("round");
        ctx.begin_path();
        ctx.move_to(tx, ty);
        ctx.line_to(
            (tx + (sign * (r * 0.08_f64).floor())),
            (ty + (r * 0.15_f64).floor()),
        );
        ctx.line_to(
            (tx + (sign * (r * 0.04_f64).floor())),
            (ty + (r * 0.26_f64).floor()),
        );
        ctx.stroke();
    }
    for sign in [-1.0_f64, 1.0_f64] {
        let ex = (cx + (sign * (r * 0.12_f64).floor()));
        let ey = (cy - (r * 0.12_f64).floor());
        let er = (2.0_f64).max((r * 0.05_f64).floor());
        ctx.begin_path();
        let _ = ctx.arc(ex, ey, er, 0.0_f64, (std::f64::consts::PI * 2.0_f64));
        ctx.set_fill_style_str("#ffffff");
        ctx.fill();
        ctx.begin_path();
        let _ = ctx.arc(
            ex,
            ey,
            (1.0_f64).max((er / 2.0_f64).floor()),
            0.0_f64,
            (std::f64::consts::PI * 2.0_f64),
        );
        ctx.set_fill_style_str("#1e1e1e");
        ctx.fill();
    }
}
