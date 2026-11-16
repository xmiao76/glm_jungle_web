//! Browser-independent game state and undo history.
use crate::{SearchOptions, position::*, tables::Tables};
use std::collections::HashMap;
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Mode {
    Human,
    Ai,
}
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
}
impl Difficulty {
    pub fn name(self) -> &'static str {
        match self {
            Self::Easy => "Easy",
            Self::Medium => "Medium",
            Self::Hard => "Hard",
        }
    }
    pub fn next(self) -> Self {
        match self {
            Self::Easy => Self::Medium,
            Self::Medium => Self::Hard,
            Self::Hard => Self::Easy,
        }
    }
    pub fn options(self) -> SearchOptions {
        SearchOptions {
            time_limit_ms: match self {
                Self::Easy => 400.0,
                Self::Medium => 1200.0,
                Self::Hard => 3000.0,
            },
            max_depth: if self == Self::Easy { Some(3) } else { None },
            ..Default::default()
        }
    }
}
#[derive(Clone, Debug)]
pub struct LogEntry {
    pub side: u8,
    pub piece: u8,
    pub mv: Move,
    pub captured: bool,
}
impl LogEntry {
    pub fn notation(&self, index: usize) -> String {
        format!(
            "{}. {} {} {}{} {} {}{}",
            index + 1,
            if self.side == BLUE { "Blue" } else { "Red" },
            NAMES[self.piece as usize],
            (b'a' + self.mv.from_col) as char,
            self.mv.from_row + 1,
            if self.captured { "x" } else { ">" },
            (b'a' + self.mv.to_col) as char,
            self.mv.to_row + 1
        )
    }
}
#[derive(Clone)]
struct Snapshot {
    position: Position,
    turn: u32,
    counts: HashMap<u64, u32>,
    history: Vec<HashPair>,
    captured: [Vec<u8>; 3],
    last: Option<i32>,
    log: Vec<LogEntry>,
}
pub struct Game {
    pub position: Position,
    pub mode: Mode,
    pub human: u8,
    pub first: u8,
    pub turn: u32,
    pub difficulty: Difficulty,
    pub flipped: bool,
    pub selected: Option<usize>,
    pub outcome: Option<u8>,
    pub last: Option<i32>,
    pub captured: [Vec<u8>; 3],
    pub log: Vec<LogEntry>,
    pub counts: HashMap<u64, u32>,
    pub history: Vec<HashPair>,
    undo: Vec<Snapshot>,
}
impl Game {
    pub fn new(mode: Mode, human: u8, first: u8, difficulty: Difficulty, t: &Tables) -> Self {
        let initial = Position::initial(t);
        let position = Position::from_pieces(&initial.pieces(), first, t).unwrap();
        Self {
            position,
            mode,
            human,
            first,
            turn: 1,
            difficulty,
            flipped: mode == Mode::Human && human == BLUE,
            selected: None,
            outcome: None,
            last: None,
            captured: std::array::from_fn(|_| Vec::new()),
            log: Vec::new(),
            counts: HashMap::new(),
            history: Vec::new(),
            undo: Vec::new(),
        }
    }
    pub fn ai_turn(&self) -> bool {
        self.outcome.is_none() && (self.mode == Mode::Ai || self.position.side != self.human)
    }
    pub fn legal(&self, t: &Tables) -> Vec<i32> {
        self.position.moves(self.position.side, t)
    }
    pub fn select(&mut self, sq: usize, t: &Tables) -> Option<i32> {
        if sq >= SQ || self.ai_turn() || self.outcome.is_some() {
            return None;
        }
        if self.selected == Some(sq) {
            self.selected = None;
            return None;
        }
        if owner(self.position.grid[sq]) == self.position.side {
            self.selected = Some(sq);
            return None;
        }
        let mv = self
            .legal(t)
            .into_iter()
            .find(|&m| Some(from(m)) == self.selected && to(m) == sq);
        if mv.is_some() {
            self.selected = None
        }
        mv
    }
    pub fn play(&mut self, mv: i32, t: &Tables) -> Result<(), String> {
        if self.outcome.is_some() || !self.legal(t).contains(&mv) {
            return Err("Engine returned an illegal move".into());
        }
        self.undo.push(Snapshot {
            position: self.position.clone(),
            turn: self.turn,
            counts: self.counts.clone(),
            history: self.history.clone(),
            captured: self.captured.clone(),
            last: self.last,
            log: self.log.clone(),
        });
        if self.undo.len() > 240 {
            self.undo.remove(0);
        }
        let side = self.position.side;
        let piece = pt(self.position.grid[from(mv)]);
        if cap(mv) != 0 {
            self.captured[side as usize].push(pt(cap(mv)));
        }
        self.position.make(mv, t);
        // Rebuild lists in board order, matching the original per-turn Board -> Position conversion.
        self.position = Position::from_pieces(&self.position.pieces(), self.position.side, t)?;
        if self.position.side == self.first {
            self.turn += 1
        }
        let key = self.position.hash.key();
        *self.counts.entry(key).or_default() += 1;
        self.history.push(self.position.hash);
        self.last = Some(mv);
        self.log.push(LogEntry {
            side,
            piece,
            mv: Move::decode(mv),
            captured: cap(mv) != 0,
        });
        let winner = self.position.winner();
        self.outcome = if winner != 0 {
            Some(winner)
        } else if self.counts[&key] >= 3 || self.turn > 400 {
            Some(0)
        } else if self.legal(t).is_empty() {
            Some(other(self.position.side))
        } else {
            None
        };
        Ok(())
    }
    pub fn can_undo(&self) -> bool {
        self.mode == Mode::Human && self.undo.iter().any(|s| s.position.side == self.human)
    }
    pub fn undo(&mut self) -> bool {
        if !self.can_undo() {
            return false;
        }
        while let Some(s) = self.undo.pop() {
            if s.position.side != self.human {
                continue;
            }
            self.position = s.position;
            self.turn = s.turn;
            self.counts = s.counts;
            self.history = s.history;
            self.captured = s.captured;
            self.last = s.last;
            self.log = s.log;
            self.selected = None;
            self.outcome = None;
            return true;
        }
        false
    }
    pub fn search_options(&self) -> SearchOptions {
        let mut opts = self.difficulty.options();
        opts.history_keys = self.history.iter().rev().take(32).rev().copied().collect();
        opts
    }
}
