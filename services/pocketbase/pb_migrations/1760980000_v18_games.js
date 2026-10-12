/// <reference path="../pb_data/types.d.ts" />
// v1.8+ ISSUE-28 Palavva Games. Additive and reversible; all collections are superuser-only (read and written server-side).
//   game_matches      one row per match: game, mode (ai_ai | human_ai | human_human), the two players (kind + id), seed, ruleset,
//                     current state (derived from the moves, kept for fast reads), result, rating changes, persona commentary
//   game_moves        append-only move log; UNIQUE (match_id, ply) means a move can never be applied twice (double-click, retry,
//                     two tabs) and a match replays exactly from its moves after any restart
//   game_challenges   invitations to play (human → agent, human → human, agent profile challenges) with expiry
//   game_ratings      Elo per (game, player kind, player); agents and humans are separate tables, never mixed
//   game_tournaments  small round-robin events; standings are computed only from finished matches
// No wagering: there is no stake, prize or Pals field anywhere in these collections.
const T = (name, o = {}) => ({ name, type: "text", ...o });
const N = (name) => ({ name, type: "number" });
const B = (name) => ({ name, type: "bool" });
const D = (name) => ({ name, type: "date" });
const J = (name, max = 200000) => ({ name, type: "json", maxSize: max });
const S = (name, values) => ({ name, type: "select", values, maxSelect: 1 });
const STAMPS = [{ name: "created", type: "autodate", onCreate: true, onUpdate: false }, { name: "updated", type: "autodate", onCreate: true, onUpdate: true }];
const TENANT = T("tenant_id", { required: true, max: 40 });
const GAME = S("game", ["oware", "checkers", "trivia"]);
const KIND = (n) => S(n, ["agent", "human"]);
const locked = (name, fields, indexes) => new Collection({ type: "base", name, listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, fields: [...fields, ...STAMPS], indexes });
const NEW = [
  ["game_matches", [TENANT, GAME, S("mode", ["ai_ai", "human_ai", "human_human"]), S("status", ["waiting", "active", "finished", "cancelled"]),
    KIND("a_kind"), T("a_id", { required: true, max: 40 }), KIND("b_kind"), T("b_id", { required: true, max: 40 }), N("seed"), T("ruleset", { max: 40 }),
    J("state", 500000), N("moves_count"), S("winner", ["a", "b", "draw"]), T("result_reason", { max: 300 }), D("started_at"), D("finished_at"), D("last_move_at"),
    D("next_bot_at"), T("tournament_id", { max: 40 }), T("challenge_id", { max: 40 }), B("rated"), B("public"), J("ratings"), J("commentary"),
    T("result_post_id", { max: 40 }), T("created_by", { max: 40 }), T("cancel_reason", { max: 300 })],
    ["CREATE INDEX idx_game_matches_status ON game_matches (tenant_id, status, game)", "CREATE INDEX idx_game_matches_finished ON game_matches (tenant_id, finished_at)",
     "CREATE INDEX idx_game_matches_a ON game_matches (tenant_id, a_kind, a_id)", "CREATE INDEX idx_game_matches_b ON game_matches (tenant_id, b_kind, b_id)"]],
  ["game_moves", [TENANT, T("match_id", { required: true, max: 40 }), N("ply"), N("side"), KIND("actor_kind"), T("actor_id", { max: 40 }), J("move", 2000), T("state_hash", { max: 64 })],
    ["CREATE UNIQUE INDEX idx_game_moves_once ON game_moves (match_id, ply)"]],
  ["game_challenges", [TENANT, GAME, KIND("from_kind"), T("from_id", { required: true, max: 40 }), KIND("to_kind"), T("to_id", { required: true, max: 40 }),
    S("status", ["open", "accepted", "declined", "cancelled", "expired"]), T("message", { max: 200 }), T("match_id", { max: 40 }), D("expires_at"), B("public")],
    ["CREATE INDEX idx_game_challenges_to ON game_challenges (tenant_id, to_kind, to_id, status)", "CREATE INDEX idx_game_challenges_from ON game_challenges (tenant_id, from_kind, from_id, status)"]],
  ["game_ratings", [TENANT, GAME, KIND("player_kind"), T("player_id", { required: true, max: 40 }), N("rating"), N("games"), N("wins"), N("losses"), N("draws"), T("country", { max: 3 })],
    ["CREATE UNIQUE INDEX idx_game_ratings_player ON game_ratings (tenant_id, game, player_kind, player_id)", "CREATE INDEX idx_game_ratings_rank ON game_ratings (tenant_id, game, player_kind, rating)"]],
  ["game_tournaments", [TENANT, T("name", { required: true, max: 120 }), GAME, S("status", ["running", "finished", "cancelled"]), T("format", { max: 30 }), J("participants"), J("standings"),
    T("created_by", { max: 40 }), D("finished_at")],
    ["CREATE INDEX idx_game_tournaments_t ON game_tournaments (tenant_id, status)"]],
];
migrate((app) => {
  for (const [name, fields, idx] of NEW) { try { app.findCollectionByNameOrId(name); } catch (_) { app.save(locked(name, fields, idx)); } }
}, (app) => {
  for (const [name] of [...NEW].reverse()) { try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {} }
});
