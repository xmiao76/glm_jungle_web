use crate::{
    position::*,
    tables::{INF, Tables},
};

pub fn nearest(p: &Position, side: u8, target_red: bool, t: &Tables) -> i32 {
    p.squares[side as usize][..p.count[side as usize]]
        .iter()
        .map(|&s| t.distance[pt(p.grid[s]) as usize][if target_red { 0 } else { 1 }][s] as i32)
        .min()
        .unwrap_or(INF as i32)
}
fn mobility(p: &Position, side: u8, t: &Tables) -> i32 {
    let mut n = 0;
    for &s in &p.squares[side as usize][..p.count[side as usize]] {
        for &d in &t.neighbors[s] {
            if d != DEN[side as usize]
                && (!water(d) || pt(p.grid[s]) == RAT)
                && owner(p.grid[d]) != side
            {
                n += 1
            }
        }
    }
    n
}
pub fn enemy_adjacent(p: &Position, s: usize, side: u8, t: &Tables) -> bool {
    t.neighbors[s]
        .iter()
        .any(|&n| p.grid[n] != 0 && owner(p.grid[n]) != side)
}
pub fn evaluate(p: &Position, player: u8, t: &Tables) -> f64 {
    let me = player as usize;
    let opp = other(player) as usize;
    if p.count[me] == 0 {
        return -100000.0;
    }
    if p.count[opp] == 0 {
        return 100000.0;
    }
    let w = &t.weights;
    let total = p.mat[me] + p.mat[opp];
    let mut score = (p.mat[me] - p.mat[opp]) as f64 * w.material_scale;
    let phase = 1.0 + (w.pst_phase_max - 1.0) * (1.0 - total as f64 / t.start_material).max(0.0);
    score += (p.pst[me] - p.pst[opp]) as f64 * phase;
    let red = player == BLUE;
    let ma = nearest(p, player, red, t);
    let md = nearest(p, player, !red, t);
    let oa = nearest(p, opp as u8, !red, t);
    let od = nearest(p, opp as u8, red, t);
    score += w.den_threat * (w.max_den_dist - ma as f64).max(0.0);
    score -= w.den_threat * (w.max_den_dist - oa as f64).max(0.0);
    score += w.den_defense * 2.0 * (w.max_den_dist - md as f64).max(0.0);
    score -= w.den_defense * 2.0 * (w.max_den_dist - od as f64).max(0.0);
    score += w.mobility * (mobility(p, player, t) - mobility(p, opp as u8, t)) as f64;
    for (side, enemy, sign) in [(me, opp, 1.0), (opp, me, -1.0)] {
        for &s in &p.squares[side][..p.count[side]] {
            if pt(p.grid[s]) == RAT {
                for &e in &p.squares[enemy][..p.count[enemy]] {
                    if pt(p.grid[e]) == ELEPHANT {
                        let dist = (s as i32 / 7 - e as i32 / 7).abs()
                            + (s as i32 % 7 - e as i32 % 7).abs();
                        if dist <= 3 {
                            score += sign * (w.rat_ele / dist.max(1) as f64).floor();
                        }
                    }
                }
            }
        }
    }
    for (side, sign) in [(me, -1.0), (opp, 1.0)] {
        for &s in &p.squares[side][..p.count[side]] {
            if trap(s) != 0 && trap(s) != side as u8 {
                score += sign
                    * t.value[p.grid[s] as usize] as f64
                    * if enemy_adjacent(p, s, side as u8, t) {
                        w.trap_danger_near
                    } else {
                        w.trap_danger_safe
                    };
            }
        }
    }
    if total as f64 <= w.race_max_mat {
        let ma = ma - i32::from(p.side == player);
        let oa = oa - i32::from(p.side == opp as u8);
        if ma < od {
            score += w.race_w * (8 - ma).max(0) as f64
        }
        if oa < md {
            score -= w.race_w * (8 - oa).max(0) as f64
        }
    }
    score
}
