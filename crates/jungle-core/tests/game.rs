use jungle_core::{game::*, *};
#[test]
fn independent_side_and_first_mover() {
    let t = Tables::default();
    for human in [BLUE, RED] {
        for first in [BLUE, RED] {
            let g = Game::new(Mode::Human, human, first, Difficulty::Medium, &t);
            assert_eq!(g.ai_turn(), human != first);
            assert_eq!(g.position.side, first);
            assert_eq!(g.flipped, human == BLUE);
        }
    }
}
#[test]
fn undo_restores_full_move_pair() {
    let t = Tables::default();
    let mut g = Game::new(Mode::Human, BLUE, BLUE, Difficulty::Easy, &t);
    let initial = g.position.clone();
    let m = g.legal(&t)[0];
    g.play(m, &t).unwrap();
    let m = g.legal(&t)[0];
    g.play(m, &t).unwrap();
    assert!(g.can_undo());
    assert!(g.undo());
    assert_eq!(g.position, initial);
    assert_eq!(g.turn, 1);
    assert!(g.log.is_empty());
    assert!(g.history.is_empty());
    assert!(g.counts.is_empty());
    assert!(g.captured.iter().all(Vec::is_empty));
    assert_eq!(g.last, None);
}
#[test]
fn den_capture_and_no_moves_finish() {
    let t = Tables::default();
    let mut g = Game::new(Mode::Human, BLUE, BLUE, Difficulty::Easy, &t);
    g.position = Position::from_pieces(&[[1, BLUE, 8, 2], [7, RED, 7, 6]], BLUE, &t).unwrap();
    g.play(encode(58, 59, 0), &t).unwrap();
    assert_eq!(g.outcome, Some(BLUE));
    assert!(g.play(encode(58, 59, 0), &t).is_err());
}
#[test]
fn capture_record_and_undo() {
    let t = Tables::default();
    let mut g = Game::new(Mode::Human, BLUE, BLUE, Difficulty::Easy, &t);
    g.position =
        Position::from_pieces(&[[1, BLUE, 2, 0], [8, RED, 2, 1], [7, RED, 8, 6]], BLUE, &t)
            .unwrap();
    let initial = g.position.clone();
    g.play(encode(14, 15, 16), &t).unwrap();
    assert_eq!(g.captured[1], vec![8]);
    assert!(g.log[0].captured);
    assert!(g.undo());
    assert_eq!(g.position, initial);
    assert!(g.captured[1].is_empty());
}
#[test]
fn draw_counts_and_turn_limit() {
    let t = Tables::default();
    let mut g = Game::new(Mode::Ai, BLUE, BLUE, Difficulty::Easy, &t);
    let cycle = [
        encode(14, 21, 0),
        encode(48, 41, 0),
        encode(21, 14, 0),
        encode(41, 48, 0),
    ];
    for m in cycle.into_iter().cycle().take(9) {
        g.play(m, &t).unwrap();
    }
    assert_eq!(g.outcome, Some(0));
    let mut g = Game::new(Mode::Ai, BLUE, BLUE, Difficulty::Easy, &t);
    g.turn = 400;
    g.play(cycle[0], &t).unwrap();
    assert_eq!(g.outcome, None);
    g.play(cycle[1], &t).unwrap();
    assert_eq!(g.outcome, Some(0));
}
#[test]
fn flip_is_view_only_and_ai_cannot_be_clicked() {
    let t = Tables::default();
    let mut g = Game::new(Mode::Ai, BLUE, BLUE, Difficulty::Easy, &t);
    let p = g.position.clone();
    g.flipped = !g.flipped;
    assert_eq!(g.position, p);
    assert_eq!(g.select(14, &t), None);
    assert!(!g.can_undo());
}
#[test]
fn timeout_leaves_completed_iteration_and_legal_move() {
    let mut e = Engine::new(12);
    let p = Position::initial(&e.tables);
    let mut clock = 0.0;
    let mut last = None;
    let r = e
        .search(
            &p.pieces(),
            BLUE,
            &SearchOptions {
                time_limit_ms: 1.0,
                ..Default::default()
            },
            &mut || {
                clock += 0.01;
                clock
            },
            &mut |r| last = Some(r.clone()),
        )
        .unwrap();
    let mv = r.best_move.unwrap();
    let (f, d) = mv.squares();
    assert!(p.moves(BLUE, &e.tables).contains(&encode(f, d, p.grid[d])));
    if let Some(last) = last {
        assert_eq!(r.best_move, last.best_move);
        assert_eq!(r.depth, last.depth);
    }
}
#[test]
fn mate_normalization() {
    for ply in [0, 5, 40] {
        for score in [25.25, 100020.0, -100020.0] {
            assert_eq!(
                jungle_core::search::score_from_tt(
                    jungle_core::search::score_to_tt(score, ply),
                    ply
                ),
                score
            );
        }
    }
}
