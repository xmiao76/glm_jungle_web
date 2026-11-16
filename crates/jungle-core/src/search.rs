use crate::{
    evaluation::{enemy_adjacent, evaluate},
    position::*,
    tables::Tables,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
pub const WIN: f64 = 100000.0;
pub const MATE: f64 = WIN - 64.0;
const EXACT: u8 = 0;
const LOWER: u8 = 1;
const UPPER: u8 = 2;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SearchConfig {
    pub aspiration: bool,
    pub rfp: bool,
    pub futility: bool,
    pub null_move: bool,
    pub lmr_aggressive: bool,
    pub countermove: bool,
    pub qsee_prune: bool,
    pub den_extension: bool,
}
impl Default for SearchConfig {
    fn default() -> Self {
        Self {
            aspiration: true,
            rfp: false,
            futility: true,
            null_move: false,
            lmr_aggressive: true,
            countermove: false,
            qsee_prune: false,
            den_extension: true,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SearchOptions {
    pub time_limit_ms: f64,
    pub max_depth: Option<i32>,
    pub history_keys: Vec<HashPair>,
    pub config: SearchConfig,
}
impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            time_limit_ms: 1500.0,
            max_depth: None,
            history_keys: Vec::new(),
            config: SearchConfig::default(),
        }
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    #[serde(rename = "move")]
    pub best_move: Option<Move>,
    pub score: f64,
    pub depth: i32,
    pub nodes: u64,
    pub nps: f64,
    pub elapsed_ms: f64,
}

#[derive(Clone, Copy)]
struct Entry {
    hi: i32,
    lo: i32,
    depth: i8,
    flag: u8,
    score: f64,
    mv: i32,
}
impl Default for Entry {
    fn default() -> Self {
        Self {
            hi: 0,
            lo: 0,
            depth: -1,
            flag: 0,
            score: 0.0,
            mv: -1,
        }
    }
}
pub struct Transposition {
    entries: Vec<Entry>,
}
impl Transposition {
    pub fn new(bits: u32) -> Self {
        Self {
            entries: vec![Entry::default(); 1 << bits.clamp(10, 22)],
        }
    }
    // Preserve JS's floating multiplication followed by ToInt32, including its rounding.
    fn index(&self, h: HashPair) -> usize {
        ((h.hi ^ ((h.lo as f64 * 2654435761.0) as i64 as i32)) as u32 as usize)
            & (self.entries.len() - 1)
    }
    fn lookup(&self, h: HashPair) -> Option<Entry> {
        let e = self.entries[self.index(h)];
        if e.depth >= 0 && e.hi == h.hi && e.lo == h.lo {
            Some(e)
        } else {
            None
        }
    }
    fn store(&mut self, h: HashPair, depth: i32, flag: u8, score: f64, mv: i32) {
        let i = self.index(h);
        if self.entries[i].depth as i32 > depth {
            return;
        }
        self.entries[i] = Entry {
            hi: h.hi,
            lo: h.lo,
            depth: depth as i8,
            flag,
            score,
            mv,
        };
    }
    pub fn clear(&mut self) {
        self.entries.fill(Entry::default())
    }
}
pub fn score_to_tt(score: f64, ply: i32) -> f64 {
    if score >= MATE {
        score + ply as f64
    } else if score <= -MATE {
        score - ply as f64
    } else {
        score
    }
}
pub fn score_from_tt(score: f64, ply: i32) -> f64 {
    if score >= MATE {
        score - ply as f64
    } else if score <= -MATE {
        score + ply as f64
    } else {
        score
    }
}
pub struct Engine {
    pub tables: Tables,
    pub tt: Transposition,
}
impl Default for Engine {
    fn default() -> Self {
        Self::new(21)
    }
}
impl Engine {
    pub fn new(bits: u32) -> Self {
        Self {
            tables: Tables::default(),
            tt: Transposition::new(bits),
        }
    }
    pub fn search(
        &mut self,
        pieces: &[[u8; 4]],
        side: u8,
        opts: &SearchOptions,
        clock: &mut dyn FnMut() -> f64,
        iteration: &mut dyn FnMut(&SearchResult),
    ) -> Result<SearchResult, String> {
        if !opts.time_limit_ms.is_finite()
            || opts.time_limit_ms < 0.0
            || opts.max_depth.is_some_and(|d| !(1..=56).contains(&d))
        {
            return Err("Invalid search time or depth".into());
        }
        let pos = Position::from_pieces(pieces, side, &self.tables)?;
        let mut root_moves = [0; 80];
        let n = pos.generate(&mut root_moves, side, &self.tables, false);
        if n == 0 {
            return Ok(SearchResult::default());
        }
        if n == 1 {
            return Ok(SearchResult {
                best_move: Some(Move::decode(root_moves[0])),
                depth: 1,
                nodes: 1,
                ..Default::default()
            });
        }
        let start = clock();
        let mut s = Searcher {
            pos,
            t: &self.tables,
            tt: &mut self.tt,
            clock,
            start,
            limit: opts.time_limit_ms,
            nodes: 0,
            cfg: opts.config.clone(),
            killers: [-1; 128],
            history: vec![0; 8192],
            counter: vec![-1; 16384],
            rep: HashMap::new(),
        };
        for h in &opts.history_keys {
            *s.rep.entry(h.key()).or_default() += 1;
        }
        s.order(&mut root_moves[..n], 0, -1, -1, false);
        let mut result = SearchResult {
            best_move: Some(Move::decode(root_moves[0])),
            ..Default::default()
        };
        let mut times: Vec<f64> = Vec::new();
        let mut previous: Option<f64> = None;
        for depth in 1..=opts.max_depth.unwrap_or(56) {
            if depth > 1 {
                let elapsed = (s.clock)() - start;
                if elapsed > opts.time_limit_ms * 0.85 {
                    break;
                }
                if let Some(&last) = times.last() {
                    let growth = if times.len() >= 2 {
                        (last / times[times.len() - 2].max(1e-6)).clamp(1.5, 5.0)
                    } else {
                        3.0
                    };
                    if elapsed + last * growth > opts.time_limit_ms {
                        break;
                    }
                }
            }
            let t0 = (s.clock)();
            let found =
                if s.cfg.aspiration && depth >= 4 && previous.is_some_and(|v| v.abs() < MATE) {
                    let prev = previous.unwrap();
                    let mut delta = 2500.0;
                    let mut alpha = prev - delta;
                    let mut beta = prev + delta;
                    loop {
                        match s.root(depth, alpha, beta) {
                            Err(e) => break Err(e),
                            Ok((mv, score)) => {
                                if score <= alpha && alpha > f64::NEG_INFINITY {
                                    alpha = score - delta;
                                    delta *= 2.0;
                                } else if score >= beta && beta < f64::INFINITY {
                                    beta = score + delta;
                                    delta *= 2.0;
                                } else {
                                    break Ok((mv, score));
                                }
                            }
                        }
                    }
                } else {
                    s.root(depth, f64::NEG_INFINITY, f64::INFINITY)
                };
            let Ok((mv, score)) = found else { break };
            times.push((s.clock)() - t0);
            previous = Some(score);
            let elapsed = (s.clock)() - start;
            result = SearchResult {
                best_move: Some(Move::decode(mv)),
                score,
                depth,
                nodes: s.nodes,
                nps: s.nodes as f64 / (elapsed / 1000.0).max(1e-9),
                elapsed_ms: elapsed,
            };
            iteration(&result);
        }
        result.elapsed_ms = (s.clock)() - start;
        result.nodes = s.nodes;
        result.nps = s.nodes as f64 / (result.elapsed_ms / 1000.0).max(1e-9);
        Ok(result)
    }
}
#[derive(Debug)]
struct Timeout;
type SearchValue = Result<f64, Timeout>;
struct Searcher<'a> {
    pos: Position,
    t: &'a Tables,
    tt: &'a mut Transposition,
    clock: &'a mut dyn FnMut() -> f64,
    start: f64,
    limit: f64,
    nodes: u64,
    cfg: SearchConfig,
    killers: [i32; 128],
    history: Vec<i32>,
    counter: Vec<i32>,
    rep: HashMap<u64, u16>,
}
fn hk(side: u8, piece: u8, d: usize) -> usize {
    ((side as usize) << 11) | ((piece as usize) << 7) | d
}
fn ck(side: u8, mv: i32) -> usize {
    (((side - 1) as usize) << 13) | (from(mv) << 7) | to(mv)
}
impl Searcher<'_> {
    fn tick(&mut self) -> Result<(), Timeout> {
        self.nodes += 1;
        if (self.nodes <= 64 || self.nodes.is_multiple_of(16))
            && (self.clock)() - self.start > self.limit
        {
            Err(Timeout)
        } else {
            Ok(())
        }
    }
    fn push(&mut self, mv: i32) {
        self.pos.make(mv, self.t);
        *self.rep.entry(self.pos.hash.key()).or_default() += 1;
    }
    fn pop(&mut self, mv: i32) {
        let key = self.pos.hash.key();
        if let Some(n) = self.rep.get_mut(&key) {
            *n -= 1;
        }
        self.pos.undo(mv, self.t);
    }
    fn killer(&self, mv: i32, ply: usize) -> bool {
        ply < 64 && (self.killers[ply * 2] == mv & 4095 || self.killers[ply * 2 + 1] == mv & 4095)
    }
    fn cutoff(&mut self, mv: i32, ply: usize, depth: i32, prev: i32) {
        if ply >= 64 {
            return;
        }
        let ft = mv & 4095;
        if self.killers[ply * 2] == -1 || self.killers[ply * 2] == ft {
            self.killers[ply * 2] = ft
        } else {
            self.killers[ply * 2 + 1] = ft
        }
        let key = hk(self.pos.side, pt(self.pos.grid[from(mv)]), to(mv));
        self.history[key] += depth * depth;
        if self.cfg.countermove && prev >= 0 {
            self.counter[ck(other(self.pos.side), prev)] = ft
        }
    }
    fn order(&self, moves: &mut [i32], ply: usize, tt: i32, prev: i32, noisy: bool) {
        let mut scores = [0; 80];
        let side = self.pos.side;
        let enemy = other(side) as usize;
        let counter = if self.cfg.countermove && prev >= 0 {
            self.counter[ck(other(side), prev)]
        } else {
            -1
        };
        for (i, &m) in moves.iter().enumerate() {
            let f = from(m);
            let d = to(m);
            let c = cap(m) as usize;
            let code = self.pos.grid[f] as usize;
            let mut v = 0;
            if noisy {
                v = 10000 + self.t.value[c] * 10 - self.t.value[code];
            } else {
                if tt >= 0 && m & 4095 == tt & 4095 {
                    v += 1000000
                }
                if d == DEN[enemy] {
                    v += 500000
                }
                if c != 0 {
                    v += 100000 + self.t.value[c] * 10 - self.t.value[code]
                } else {
                    let ft = m & 4095;
                    if ply < 64 && ft == self.killers[ply * 2] {
                        v += 90000
                    } else if ply < 64 && ft == self.killers[ply * 2 + 1] {
                        v += 80000
                    } else if ft == counter {
                        v += 85000
                    }
                    v += self.history[hk(side, pt(code as u8), d)].min(79000);
                    v += (self.t.manhattan[enemy][f] - self.t.manhattan[enemy][d]) * 5;
                }
            }
            scores[i] = v;
        }
        for i in 1..moves.len() {
            let m = moves[i];
            let score = scores[i];
            let mut j = i;
            while j > 0 && scores[j - 1] < score {
                moves[j] = moves[j - 1];
                scores[j] = scores[j - 1];
                j -= 1;
            }
            moves[j] = m;
            scores[j] = score;
        }
    }
    fn root(&mut self, depth: i32, mut alpha: f64, beta: f64) -> Result<(i32, f64), Timeout> {
        let mut moves = [0; 80];
        let n = self.pos.generate(&mut moves, self.pos.side, self.t, false);
        let tt = self.tt.lookup(self.pos.hash).map_or(-1, |e| e.mv);
        self.order(&mut moves[..n], 0, tt, -1, false);
        let original = alpha;
        let mut best = f64::NEG_INFINITY;
        let mut best_move = moves[0];
        for (i, &mv) in moves[..n].iter().enumerate() {
            self.push(mv);
            let result = (|| {
                let mut score = if i == 0 {
                    -self.ab(depth - 1, -beta, -alpha, 1, false, -1)?
                } else {
                    -self.ab(depth - 1, -alpha - 1.0, -alpha, 1, false, -1)?
                };
                if i != 0 && alpha < score && score < beta {
                    score = -self.ab(depth - 1, -beta, -alpha, 1, false, -1)?
                }
                Ok(score)
            })();
            self.pop(mv);
            let score = result?;
            if score > best {
                best = score;
                best_move = mv
            }
            alpha = alpha.max(score);
        }
        let flag = if best <= original {
            UPPER
        } else if best >= beta {
            LOWER
        } else {
            EXACT
        };
        self.tt.store(
            self.pos.hash,
            depth,
            flag,
            score_to_tt(best, 0),
            best_move & 4095,
        );
        Ok((best_move, best))
    }
    fn ab(
        &mut self,
        mut depth: i32,
        mut alpha: f64,
        mut beta: f64,
        ply: usize,
        parent_check: bool,
        prev: i32,
    ) -> SearchValue {
        self.tick()?;
        let winner = self.pos.winner();
        if winner != 0 {
            return Ok(if winner == self.pos.side {
                WIN + (64 - ply) as f64
            } else {
                -WIN - (64 - ply) as f64
            });
        }
        if self.rep.get(&self.pos.hash.key()).copied().unwrap_or(0) >= 2 {
            return Ok(0.0);
        }
        if ply >= 56 {
            return Ok(evaluate(&self.pos, self.pos.side, self.t));
        }
        let side = self.pos.side;
        let check = enemy_adjacent(&self.pos, DEN[side as usize], side, self.t);
        if check && self.cfg.den_extension && !parent_check && ply < 40 {
            depth += 1
        }
        if depth <= 0 {
            return self.quiesce(alpha, beta, 0);
        }
        let mut tt_move = -1;
        if let Some(e) = self.tt.lookup(self.pos.hash) {
            tt_move = e.mv;
            let score = score_from_tt(e.score, ply as i32);
            if e.depth as i32 >= depth {
                if e.flag == EXACT {
                    return Ok(score);
                }
                if e.flag == LOWER && score > alpha {
                    alpha = score
                } else if e.flag == UPPER && score < beta {
                    beta = score
                }
                if alpha >= beta {
                    return Ok(score);
                }
            }
        }
        let cut = beta - alpha <= 1.0;
        if self.cfg.rfp && cut && !check && depth <= 3 && beta.abs() < MATE {
            let stand = evaluate(&self.pos, side, self.t);
            if stand - 140.0 * depth as f64 >= beta {
                return Ok(stand);
            }
        }
        if self.cfg.null_move
            && cut
            && !check
            && depth >= 3
            && beta.abs() < MATE
            && self.pos.count[other(side) as usize] >= 3
        {
            self.pos.null_move(self.t);
            let result = self.ab(
                depth - 1 - if depth > 6 { 3 } else { 2 },
                -beta,
                -beta + 1.0,
                ply + 1,
                false,
                prev,
            );
            self.pos.null_move(self.t);
            let score = -result?;
            if score >= beta && score.abs() < MATE {
                return Ok(score);
            }
        }
        let mut moves = [0; 80];
        let n = self.pos.generate(&mut moves, side, self.t, false);
        if n == 0 {
            return Ok(-WIN - (64 - ply) as f64);
        }
        self.order(&mut moves[..n], ply, tt_move, prev, false);
        let original = alpha;
        let mut best = f64::NEG_INFINITY;
        let mut best_move = -1;
        let mut first = true;
        let enemy_den = DEN[other(side) as usize];
        let fut = if self.cfg.futility && !check && depth <= 2 && alpha.abs() < MATE {
            Some(evaluate(&self.pos, side, self.t) + 120.0 * depth as f64)
        } else {
            None
        };
        for (i, &mv) in moves[..n].iter().enumerate() {
            let captured = cap(mv);
            let dest = to(mv);
            let killer = self.killer(mv, ply);
            if i > 0
                && captured == 0
                && dest != enemy_den
                && !killer
                && fut.is_some_and(|v| v <= alpha)
            {
                continue;
            }
            self.push(mv);
            let result = (|| {
                let reduction = if !check
                    && i >= 4
                    && depth >= 3
                    && captured == 0
                    && dest != enemy_den
                    && !killer
                {
                    if self.cfg.lmr_aggressive {
                        (1 + depth / 6 + i as i32 / 8).min(3)
                    } else {
                        1
                    }
                } else {
                    0
                };
                let mut score;
                if first {
                    score = -self.ab(depth - 1, -beta, -alpha, ply + 1, check, mv)?;
                    first = false;
                } else {
                    score = -self.ab(
                        depth - 1 - reduction,
                        -alpha - 1.0,
                        -alpha,
                        ply + 1,
                        check,
                        -1,
                    )?;
                    if reduction > 0 && score > alpha {
                        score = -self.ab(depth - 1, -alpha - 1.0, -alpha, ply + 1, check, mv)?
                    }
                    if alpha < score && score < beta {
                        score = -self.ab(depth - 1, -beta, -alpha, ply + 1, check, mv)?
                    }
                }
                Ok(score)
            })();
            self.pop(mv);
            let score = result?;
            if score > best {
                best = score;
                best_move = mv & 4095
            }
            alpha = alpha.max(score);
            if alpha >= beta {
                if captured == 0 && dest != enemy_den {
                    self.cutoff(mv, ply, depth, prev)
                }
                break;
            }
        }
        let flag = if best <= original {
            UPPER
        } else if best >= beta {
            LOWER
        } else {
            EXACT
        };
        self.tt.store(
            self.pos.hash,
            depth,
            flag,
            score_to_tt(best, ply as i32),
            best_move,
        );
        Ok(best)
    }
    fn quiesce(&mut self, mut alpha: f64, beta: f64, qply: usize) -> SearchValue {
        self.tick()?;
        let winner = self.pos.winner();
        if winner != 0 {
            return Ok(if winner == self.pos.side { WIN } else { -WIN });
        }
        let stand = evaluate(&self.pos, self.pos.side, self.t);
        if stand >= beta {
            return Ok(stand);
        }
        alpha = alpha.max(stand);
        if qply > 16 {
            return Ok(alpha);
        }
        let mut moves = [0; 80];
        let n = self.pos.generate(&mut moves, self.pos.side, self.t, true);
        self.order(&mut moves[..n], 0, -1, -1, true);
        let enemy_den = DEN[other(self.pos.side) as usize];
        for &mv in &moves[..n] {
            let attacker = self.pos.grid[from(mv)];
            let dest = to(mv);
            let captured = cap(mv);
            if self.cfg.qsee_prune
                && captured != 0
                && dest != enemy_den
                && self.t.value[captured as usize] + 150 < self.t.value[attacker as usize]
                && self.t.neighbors[dest].iter().any(|&n| {
                    let c = self.pos.grid[n];
                    c != 0 && owner(c) != owner(attacker) && capture(c, n, attacker, dest)
                })
            {
                continue;
            }
            self.pos.make(mv, self.t);
            let result = self.quiesce(-beta, -alpha, qply + 1);
            self.pos.undo(mv, self.t);
            let score = -result?;
            if score >= beta {
                return Ok(score);
            }
            alpha = alpha.max(score);
        }
        Ok(alpha)
    }
}
