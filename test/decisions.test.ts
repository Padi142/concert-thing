import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { judgeSongMatches, rejudgeSongMatches } from "../src/server/decisions";
import type { Env } from "../src/server/env";

class Statement {
  constructor(private readonly database: DatabaseSync, private readonly sql: string, private readonly params: unknown[] = []) {}
  bind(...params: unknown[]): Statement { return new Statement(this.database, this.sql, params); }
  first<T>(): T | null { return (this.database.prepare(this.sql).get(...this.params) as T | undefined) ?? null; }
  all<T>(): { results: T[] } { return { results: this.database.prepare(this.sql).all(...this.params) as T[] }; }
  run(): { meta: { changes: number } } {
    const result = this.database.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(result.changes) } };
  }
}

type Call = { state: Record<string, unknown>; questions: Record<string, { type: string; instructions: string; criteria?: Record<string, string> }> };
type Reply = (call: Call) => Record<string, unknown>;

function archive(reply: Reply | null) {
  const database = new DatabaseSync(":memory:");
  for (const migration of readdirSync("migrations").sort()) database.exec(readFileSync(`migrations/${migration}`, "utf8"));
  database.exec(`
    INSERT INTO shows (id,title,venue,starts_at,ends_at,timezone,created_at,owner_id)
      VALUES ('main','Main stage','Festival','2026-07-04T20:00:00Z','2026-07-04T22:00:00Z','UTC','2026-01-01','owner'),
             ('second','Second stage','Festival','2026-07-04T20:30:00Z','2026-07-04T22:30:00Z','UTC','2026-01-01','owner'),
             ('other','Other owner','Festival','2026-07-04T20:00:00Z','2026-07-04T22:00:00Z','UTC','2026-01-01','stranger');
    INSERT INTO artists (id,name) VALUES ('radiohead','Radiohead'), ('fontaines','Fontaines D.C.');
    INSERT INTO show_artists (show_id,artist_id) VALUES ('main','radiohead'), ('second','fontaines');
    INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,captured_at,status,created_at,owner_id)
      VALUES ('video','object','clip.mp4','video','video/mp4',1,'2026-07-04T21:10:00Z','ready','2026-07-04','owner');
    INSERT INTO songs (id,title,primary_artist,normalized_title,normalized_artist,created_at)
      VALUES ('song','Owner title','Owner Artist','owner title','owner artist','2026-01-01');
    INSERT INTO song_matches (id,media_id,provider,provider_match_id,start_ms,confidence,candidate_title,candidate_artist,review_state,song_id,created_at,updated_at)
      VALUES ('karma','video','acrcloud','a',5000,90,'Karma Police','Radiohead','pending',NULL,'2026-07-04','2026-07-04'),
             ('stray','video','acrcloud','b',60000,40,'Shape of You','Ed Sheeran','pending',NULL,'2026-07-04','2026-07-04'),
             ('reviewed','video','acrcloud','c',90000,70,'Creep','Radiohead','confirmed','song','2026-07-04','2026-07-04');
  `);
  const calls: Call[] = [];
  const env = {
    DB: {
      prepare: (sql: string) => new Statement(database, sql),
      batch: async (statements: Statement[]) => statements.map(statement => statement.run()),
    } as unknown as D1Database,
    AI: reply ? {
      run: async (_model: string, input: Record<string, unknown>) => {
        const call = input as unknown as Call;
        calls.push(call);
        return { model: "clef", answers: reply(call) };
      },
    } : undefined,
  } as Env;
  const media = () => ({ ...database.prepare("SELECT show_id,assignment_method FROM media_items WHERE id = 'video'").get() }) as { show_id: string | null; assignment_method: string | null };
  const plausibility = (id: string) => (database.prepare("SELECT plausibility FROM song_matches WHERE id = ?").get(id) as { plausibility: number | null }).plausibility;
  return { database, env, calls, media, plausibility };
}

/** Answers every question the way the model would for a Radiohead recording. */
function radioheadEvidence(showProbability: number): Reply {
  return ({ questions }) => {
    const answers: Record<string, unknown> = {};
    for (const [id, question] of Object.entries(questions)) {
      if (question.type === "choice") {
        const option = Object.entries(question.criteria!).find(([, summary]) => summary.includes("Radiohead"))![0];
        answers[id] = { type: "choice", choice: option, probabilities: { [option]: showProbability, none: 1 - showProbability }, confidence: 0.5 };
      } else {
        answers[id] = { type: "noul", noul: question.instructions.includes("Radiohead") ? 0.95 : 0.04 };
      }
    }
    return answers;
  };
}

{
  const { database, env, calls, media, plausibility } = archive(radioheadEvidence(0.93));
  database.exec("UPDATE media_items SET show_id = 'main', assignment_method = 'automatic' WHERE id = 'video'");
  await judgeSongMatches(env, "video", "owner");
  assert.equal(calls.length, 1, "an assigned video needs no Show decision");
  assert.deepEqual(Object.keys(calls[0].questions).length, 2, "only pending candidates are judged");
  assert.deepEqual((calls[0].state.show as { artists: string[] }).artists, ["Radiohead"]);
  assert.equal(plausibility("karma"), 0.95);
  assert.equal(plausibility("stray"), 0.04);
  assert.equal(plausibility("reviewed"), null, "Owner-reviewed Song Matches are never judged");
  assert.equal(media().show_id, "main");
}

{
  const { env, calls, media, plausibility } = archive(radioheadEvidence(0.93));
  await judgeSongMatches(env, "video", "owner");
  assert.deepEqual(Object.keys(calls[0].questions.show.criteria!), ["show_1", "show_2", "none"], "only the Owner's nearby Shows are offered");
  assert.deepEqual(media(), { show_id: "main", assignment_method: "automatic" });
  assert.equal(plausibility("karma"), 0.95, "candidates are judged against the newly assigned Show");
}

{
  const { env, calls, media, plausibility } = archive(radioheadEvidence(0.6));
  await judgeSongMatches(env, "video", "owner");
  assert.equal(calls.length, 1);
  assert.deepEqual(media(), { show_id: null, assignment_method: null }, "a weak Show choice awaits Owner review");
  assert.equal(plausibility("karma"), null, "there is no Show to judge candidates against");
}

{
  const { database, env, calls, media } = archive(radioheadEvidence(0.99));
  database.exec("UPDATE media_items SET assignment_method = 'owner' WHERE id = 'video'");
  await judgeSongMatches(env, "video", "owner");
  assert.equal(calls.length, 0, "an Owner's choice to leave a video unassigned is final");
  assert.equal(media().show_id, null);
}

{
  const { database, env, calls, media } = archive(radioheadEvidence(0.99));
  database.exec("UPDATE media_items SET owner_id = 'stranger' WHERE id = 'video'");
  await judgeSongMatches(env, "video", "owner");
  assert.equal(calls.length, 0, "another Owner's video is never judged");
  assert.equal(media().show_id, null);
}

{
  const { database, env, media, plausibility } = archive(() => { throw new Error("model unavailable"); });
  database.exec("UPDATE media_items SET show_id = 'main', assignment_method = 'automatic' WHERE id = 'video'");
  await judgeSongMatches(env, "video", "owner");
  assert.equal(plausibility("karma"), null, "a failed decision leaves candidates untouched");
  assert.equal(media().show_id, "main");
}

{
  const { database, env, plausibility } = archive(() => ({ match_1: { type: "noul", noul: 7 }, match_2: {} }));
  database.exec("UPDATE media_items SET show_id = 'main', assignment_method = 'automatic' WHERE id = 'video'");
  await judgeSongMatches(env, "video", "owner");
  assert.equal(plausibility("karma"), null, "malformed answers are ignored");
}

{
  const { database, env, calls, plausibility } = archive(radioheadEvidence(0.93));
  database.exec("UPDATE song_matches SET plausibility = 0.9 WHERE id IN ('stray','reviewed')");
  database.exec("UPDATE media_items SET show_id = NULL, assignment_method = 'owner' WHERE id = 'video'");
  await rejudgeSongMatches(env, "video", "owner");
  assert.equal(calls.length, 0);
  assert.equal(plausibility("stray"), null, "unassigning clears judgements made against the old Show");
  assert.equal(plausibility("reviewed"), 0.9, "only pending candidates are cleared");
  database.exec("UPDATE media_items SET show_id = 'second' WHERE id = 'video'");
  await rejudgeSongMatches(env, "video", "owner");
  assert.deepEqual((calls[0].state.show as { artists: string[] }).artists, ["Fontaines D.C."], "candidates are judged against the Owner's Show");
}

{
  const { database, env, plausibility } = archive(null);
  database.exec("UPDATE media_items SET show_id = 'main', assignment_method = 'automatic' WHERE id = 'video'");
  await judgeSongMatches(env, "video", "owner");
  assert.equal(plausibility("karma"), null, "the archive works without the decision binding");
}

console.log("Song Match decisions: passed");
