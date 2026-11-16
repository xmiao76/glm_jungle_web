use crate::tables::Tables;
use serde::{Deserialize, Serialize};

pub const BLUE: u8 = 1;
pub const RED: u8 = 2;
pub const RAT: u8 = 1;
pub const TIGER: u8 = 6;
pub const LION: u8 = 7;
pub const ELEPHANT: u8 = 8;
pub const SQ: usize = 63;
pub const DEN: [usize; 3] = [0, 3, 59];
pub const NAMES: [&str; 9] = [
    "", "Rat", "Cat", "Dog", "Wolf", "Leopard", "Tiger", "Lion", "Elephant",
];
pub const CHARS: [&str; 9] = ["", "鼠", "猫", "狗", "狼", "豹", "虎", "狮", "象"];
pub const TERRAIN: [u8; SQ] = [
    0, 0, 2, 4, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0,
    1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 3, 5, 3, 0, 0,
];
pub const DIRS: [(i32, i32); 4] = [(-1, 0), (1, 0), (0, -1), (0, 1)];
pub type Pieces = Vec<[u8; 4]>;
pub fn pt(code: u8) -> u8 {
    if code == 0 { 0 } else { (code - 1) % 8 + 1 }
}
pub fn owner(code: u8) -> u8 {
    if code == 0 {
        0
    } else if code <= 8 {
        BLUE
    } else {
        RED
    }
}
pub fn other(side: u8) -> u8 {
    3 - side
}
pub fn water(sq: usize) -> bool {
    TERRAIN[sq] == 1
}
pub fn trap(sq: usize) -> u8 {
    match TERRAIN[sq] {
        2 => BLUE,
        3 => RED,
        _ => 0,
    }
}
pub fn from(mv: i32) -> usize {
    (mv & 63) as usize
}
pub fn to(mv: i32) -> usize {
    ((mv >> 6) & 63) as usize
}
pub fn cap(mv: i32) -> u8 {
    (mv >> 12) as u8
}
pub fn encode(f: usize, t: usize, c: u8) -> i32 {
    (f | t << 6 | (c as usize) << 12) as i32
}
pub fn neighbor(sq: usize, dr: i32, dc: i32) -> Option<usize> {
    let r = sq as i32 / 7 + dr;
    let c = sq as i32 % 7 + dc;
    if (0..9).contains(&r) && (0..7).contains(&c) {
        Some((r * 7 + c) as usize)
    } else {
        None
    }
}
pub fn capture(a: u8, asq: usize, d: u8, dsq: usize) -> bool {
    let ap = pt(a);
    let dp = pt(d);
    if ap == ELEPHANT && dp == RAT {
        return false;
    }
    if ap == RAT && dp == ELEPHANT {
        return !water(asq);
    }
    if dp == RAT && water(dsq) {
        return ap == RAT && water(asq);
    }
    let ar = if trap(asq) != 0 && trap(asq) != owner(a) {
        0
    } else {
        ap
    };
    let dr = if trap(dsq) != 0 && trap(dsq) != owner(d) {
        0
    } else {
        dp
    };
    ar >= dr
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct HashPair {
    pub hi: i32,
    pub lo: i32,
}
impl HashPair {
    pub fn key(self) -> u64 {
        ((self.hi as u32 as u64) << 32) | self.lo as u32 as u64
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Move {
    pub from_row: u8,
    pub from_col: u8,
    pub to_row: u8,
    pub to_col: u8,
}
impl Move {
    pub fn decode(m: i32) -> Self {
        Self {
            from_row: (from(m) / 7) as u8,
            from_col: (from(m) % 7) as u8,
            to_row: (to(m) / 7) as u8,
            to_col: (to(m) % 7) as u8,
        }
    }
    pub fn squares(self) -> (usize, usize) {
        (
            self.from_row as usize * 7 + self.from_col as usize,
            self.to_row as usize * 7 + self.to_col as usize,
        )
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Position {
    pub grid: [u8; SQ],
    pub squares: [[usize; 8]; 3],
    pub count: [usize; 3],
    pub mat: [i32; 3],
    pub pst: [i32; 3],
    pub hash: HashPair,
    pub side: u8,
}
impl Position {
    pub fn initial(t: &Tables) -> Self {
        Self::from_pieces(
            &[
                [7, 1, 0, 0],
                [6, 1, 0, 6],
                [3, 1, 1, 1],
                [2, 1, 1, 5],
                [1, 1, 2, 0],
                [5, 1, 2, 2],
                [4, 1, 2, 4],
                [8, 1, 2, 6],
                [6, 2, 8, 0],
                [7, 2, 8, 6],
                [2, 2, 7, 1],
                [3, 2, 7, 5],
                [8, 2, 6, 0],
                [4, 2, 6, 2],
                [5, 2, 6, 4],
                [1, 2, 6, 6],
            ],
            BLUE,
            t,
        )
        .unwrap()
    }
    pub fn from_pieces(pieces: &[[u8; 4]], side: u8, t: &Tables) -> Result<Self, String> {
        if side != BLUE && side != RED {
            return Err("Invalid side to move".into());
        }
        let mut p = Self {
            grid: [0; SQ],
            squares: [[0; 8]; 3],
            count: [0; 3],
            mat: [0; 3],
            pst: [0; 3],
            hash: HashPair::default(),
            side,
        };
        for &[piece, player, r, c] in pieces {
            if !(1..=8).contains(&piece) || !(1..=2).contains(&player) || r >= 9 || c >= 7 {
                return Err("Invalid piece tuple".into());
            }
            let s = player as usize;
            let sq = r as usize * 7 + c as usize;
            if p.grid[sq] != 0 || p.count[s] >= 8 {
                return Err("Overlapping pieces or more than eight pieces per side".into());
            }
            p.grid[sq] = piece + (player - 1) * 8;
            p.count[s] += 1;
        }
        p.count = [0; 3];
        for sq in 0..SQ {
            let c = p.grid[sq] as usize;
            if c == 0 {
                continue;
            }
            let s = owner(c as u8) as usize;
            p.squares[s][p.count[s]] = sq;
            p.count[s] += 1;
            p.mat[s] += t.value[c];
            p.pst[s] += t.pst[c * SQ + sq];
            p.hash.hi ^= t.zhi[sq * 17 + c];
            p.hash.lo ^= t.zlo[sq * 17 + c];
        }
        if side == BLUE {
            p.hash.hi ^= t.side_key.hi;
            p.hash.lo ^= t.side_key.lo
        }
        Ok(p)
    }
    pub fn pieces(&self) -> Pieces {
        (0..SQ)
            .filter_map(|s| {
                let c = self.grid[s];
                if c == 0 {
                    None
                } else {
                    Some([pt(c), owner(c), (s / 7) as u8, (s % 7) as u8])
                }
            })
            .collect()
    }
    pub fn moves(&self, side: u8, t: &Tables) -> Vec<i32> {
        let mut out = [0; 80];
        let n = self.generate(&mut out, side, t, false);
        out[..n].to_vec()
    }
    pub fn generate(&self, out: &mut [i32; 80], side: u8, t: &Tables, noisy: bool) -> usize {
        let mut n = 0;
        for &sq in &self.squares[side as usize][..self.count[side as usize]] {
            let code = self.grid[sq];
            let piece = pt(code);
            for &nsq in &t.neighbors[sq] {
                if nsq == DEN[side as usize] || (water(nsq) && piece != RAT) {
                    continue;
                }
                let target = self.grid[nsq];
                if (target == 0 && (!noisy || nsq == DEN[other(side) as usize]))
                    || (target != 0 && owner(target) != side && capture(code, sq, target, nsq))
                {
                    out[n] = encode(sq, nsq, target);
                    n += 1;
                }
            }
            if piece == LION || piece == TIGER {
                for jump in &t.jumps[sq] {
                    if jump.lane.len() > if piece == LION { 3 } else { 2 }
                        || jump.land == DEN[side as usize]
                        || jump.lane.iter().any(|&s| pt(self.grid[s]) == RAT)
                    {
                        continue;
                    }
                    let target = self.grid[jump.land];
                    if (target == 0 && !noisy)
                        || (target != 0
                            && owner(target) != side
                            && capture(code, sq, target, jump.land))
                    {
                        out[n] = encode(sq, jump.land, target);
                        n += 1;
                    }
                }
            }
        }
        n
    }
    pub fn winner(&self) -> u8 {
        if owner(self.grid[DEN[2]]) == BLUE {
            return BLUE;
        }
        if owner(self.grid[DEN[1]]) == RED {
            return RED;
        }
        // Rules-engine precedence also handles an empty custom position.
        if self.count[1] == 0 {
            return RED;
        }
        if self.count[2] == 0 {
            return BLUE;
        }
        0
    }
    pub fn make(&mut self, mv: i32, t: &Tables) {
        let f = from(mv);
        let d = to(mv);
        let captured = cap(mv) as usize;
        let code = self.grid[f] as usize;
        let s = owner(code as u8) as usize;
        let o = 3 - s;
        self.grid[f] = 0;
        self.grid[d] = code as u8;
        for sq in &mut self.squares[s][..self.count[s]] {
            if *sq == f {
                *sq = d;
                break;
            }
        }
        self.pst[s] += t.pst[code * SQ + d] - t.pst[code * SQ + f];
        if captured != 0 {
            let i = self.squares[o][..self.count[o]]
                .iter()
                .position(|&sq| sq == d)
                .unwrap();
            self.squares[o].copy_within(i + 1..self.count[o], i);
            self.count[o] -= 1;
            self.mat[o] -= t.value[captured];
            self.pst[o] -= t.pst[captured * SQ + d];
            self.hash.hi ^= t.zhi[d * 17 + captured];
            self.hash.lo ^= t.zlo[d * 17 + captured];
        }
        self.hash.hi ^= t.zhi[f * 17 + code] ^ t.zhi[d * 17 + code] ^ t.side_key.hi;
        self.hash.lo ^= t.zlo[f * 17 + code] ^ t.zlo[d * 17 + code] ^ t.side_key.lo;
        self.side = other(self.side);
    }
    pub fn undo(&mut self, mv: i32, t: &Tables) {
        let f = from(mv);
        let d = to(mv);
        let captured = cap(mv) as usize;
        let code = self.grid[d] as usize;
        let s = owner(code as u8) as usize;
        let o = 3 - s;
        self.grid[f] = code as u8;
        self.grid[d] = captured as u8;
        for sq in &mut self.squares[s][..self.count[s]] {
            if *sq == d {
                *sq = f;
                break;
            }
        }
        self.pst[s] += t.pst[code * SQ + f] - t.pst[code * SQ + d];
        if captured != 0 {
            self.squares[o][self.count[o]] = d;
            self.count[o] += 1;
            self.mat[o] += t.value[captured];
            self.pst[o] += t.pst[captured * SQ + d];
            self.hash.hi ^= t.zhi[d * 17 + captured];
            self.hash.lo ^= t.zlo[d * 17 + captured];
        }
        self.hash.hi ^= t.zhi[f * 17 + code] ^ t.zhi[d * 17 + code] ^ t.side_key.hi;
        self.hash.lo ^= t.zlo[f * 17 + code] ^ t.zlo[d * 17 + code] ^ t.side_key.lo;
        self.side = other(self.side);
    }
    pub fn null_move(&mut self, t: &Tables) {
        self.side = other(self.side);
        self.hash.hi ^= t.side_key.hi;
        self.hash.lo ^= t.side_key.lo;
    }
}
