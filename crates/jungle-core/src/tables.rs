use crate::position::*;
#[path = "weights.rs"]
mod weights;
pub use weights::Weights;
pub const INF: u8 = 99;
const KEYS: [&str; 9] = [
    "", "rat", "cat", "dog", "wolf", "leopard", "tiger", "lion", "elephant",
];
#[derive(Clone, Debug)]
pub struct Jump {
    pub land: usize,
    pub lane: Vec<usize>,
}
#[derive(Clone)]
pub struct Tables {
    pub neighbors: [Vec<usize>; SQ],
    pub jumps: [Vec<Jump>; SQ],
    pub distance: [[[u8; SQ]; 2]; 9],
    pub manhattan: [[i32; SQ]; 3],
    pub pst: Vec<i32>,
    pub value: [i32; 17],
    pub zhi: Vec<i32>,
    pub zlo: Vec<i32>,
    pub side_key: HashPair,
    pub weights: Weights,
    pub start_material: f64,
}
pub fn random32(a: &mut u32) -> u32 {
    *a = a.wrapping_add(0x6d2b79f5);
    let mut t = *a;
    t = (t ^ (t >> 15)).wrapping_mul(t | 1);
    t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
    t ^ (t >> 14)
}
impl Default for Tables {
    fn default() -> Self {
        Self::new(Weights::default())
    }
}
impl Tables {
    pub fn new(weights: Weights) -> Self {
        let neighbors = std::array::from_fn(|s| {
            DIRS.iter()
                .filter_map(|&(r, c)| neighbor(s, r, c))
                .collect()
        });
        let jumps = std::array::from_fn(|s| {
            let mut out = Vec::new();
            for (dr, dc) in DIRS {
                let mut ns = neighbor(s, dr, dc);
                let mut lane = Vec::new();
                while let Some(n) = ns {
                    if !water(n) {
                        break;
                    }
                    lane.push(n);
                    ns = neighbor(n, dr, dc);
                }
                if let Some(land) = ns
                    && !lane.is_empty()
                {
                    out.push(Jump { land, lane })
                }
            }
            out
        });
        let mut t = Self {
            neighbors,
            jumps,
            distance: [[[INF; SQ]; 2]; 9],
            manhattan: [[0; SQ]; 3],
            pst: vec![0; 17 * SQ],
            value: [0; 17],
            zhi: vec![0; SQ * 17 + 17],
            zlo: vec![0; SQ * 17 + 17],
            side_key: HashPair::default(),
            weights,
            start_material: 0.0,
        };
        let mut seed = 42;
        for i in 0..t.zhi.len() {
            t.zhi[i] = random32(&mut seed) as i32;
            t.zlo[i] = random32(&mut seed) as i32;
        }
        t.side_key = HashPair {
            hi: random32(&mut seed) as i32,
            lo: random32(&mut seed) as i32,
        };
        for p in 1..=8 {
            for target in 0..2 {
                t.distance[p][target] = t.bfs(
                    if target == 0 { 59 } else { 3 },
                    if target == 0 { 3 } else { 59 },
                    p == 1,
                    match p {
                        6 => 2,
                        7 => 3,
                        _ => 0,
                    },
                );
            }
        }
        for s in 0..SQ {
            for (side, den) in DEN.iter().enumerate().skip(1) {
                t.manhattan[side][s] =
                    (s as i32 / 7 - *den as i32 / 7).abs() + (s as i32 % 7 - 3).abs();
            }
        }
        t.rebuild();
        t
    }
    fn bfs(&self, den: usize, own: usize, swim: bool, leap: usize) -> [u8; SQ] {
        let mut dist = [INF; SQ];
        dist[den] = 0;
        let mut queue = vec![den];
        let mut head = 0;
        while head < queue.len() {
            let s = queue[head];
            head += 1;
            let d = dist[s] + 1;
            for &p in &self.neighbors[s] {
                if dist[p] > d && p != own && (swim || (!water(p) && !water(s))) {
                    dist[p] = d;
                    queue.push(p);
                }
            }
            if leap > 0 {
                for (p, jumps) in self.jumps.iter().enumerate() {
                    if dist[p] > d
                        && p != own
                        && jumps.iter().any(|j| j.land == s && j.lane.len() <= leap)
                    {
                        dist[p] = d;
                        queue.push(p);
                    }
                }
            }
        }
        dist
    }
    pub fn rebuild(&mut self) {
        let w = &self.weights;
        self.start_material = 0.0;
        for (piece, key) in KEYS.iter().enumerate().skip(1) {
            let v = w.get(&format!("value_{key}")) as i32;
            self.value[piece] = v;
            self.value[piece + 8] = v;
            self.start_material += 2.0 * v as f64;
        }
        for code in 1..17 {
            let piece = pt(code as u8) as usize;
            let side = owner(code as u8);
            let key = KEYS[piece];
            let adv = w.get(&format!("adv_w_{key}"));
            let tw = w.get(&format!("trap_control_{key}"));
            let home = w.get(&format!("home_defense_{key}"));
            for s in 0..SQ {
                let mut v = 0.0;
                let d = self.distance[piece][if side == BLUE { 0 } else { 1 }][s];
                if d < INF {
                    v += (w.adv_spread - d as f64).max(0.0) * adv
                }
                if self.neighbors[s]
                    .iter()
                    .any(|&n| trap(n) != 0 && trap(n) != side)
                {
                    v += tw
                }
                if self.manhattan[side as usize][s] <= 2 {
                    v += home
                }
                if water(s) {
                    if piece == 1 {
                        v += w.rat_water
                    }
                } else if self.neighbors[s].iter().any(|&n| water(n)) {
                    if piece == 1 {
                        v += w.rat_water_adjacent
                    } else if piece == 8 {
                        v += w.ele_water_adjacent
                    }
                }
                if (piece == 4 || piece == 5) && (2..=4).contains(&(s % 7)) {
                    v += w.center_file
                }
                self.pst[code * SQ + s] = v as i32;
            }
        }
    }
}
