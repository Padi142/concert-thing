import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { CANDIDATE_UPSERT_SQL } from "../src/server/recognition";

const database = new DatabaseSync(":memory:");
for (const migration of ["0001_initial.sql", "0002_assignment_provenance.sql", "0003_song_recognition.sql", "0004_stream_video.sql"]) {
  database.exec(readFileSync(`migrations/${migration}`, "utf8"));
}
database.prepare(`INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,status,created_at)
  VALUES ('media','object','video.mp4','video','video/mp4',100,'ready','2026-01-01')`).run();
database.prepare(`INSERT INTO recognition_jobs (id,media_id,provider,status,created_at,updated_at)
  VALUES ('job','media','acrcloud','completed','2026-01-01','2026-01-01')`).run();
database.prepare(`INSERT INTO songs (id,title,primary_artist,normalized_title,normalized_artist,created_at)
  VALUES ('song','Owner title','Owner Artist','owner title','owner artist','2026-01-01')`).run();

const candidate = ["match", "media", "job", "provider-id", 10_000, 20_000, 80, "Machine title", "Machine Artist", "{}", "2026-01-01", "2026-01-01"];
database.prepare(CANDIDATE_UPSERT_SQL).run(...candidate);
database.prepare(`UPDATE song_matches SET review_state = 'edited', song_id = 'song', owner_title = 'Owner title', owner_artist = 'Owner Artist' WHERE id = 'match'`).run();
database.prepare(CANDIDATE_UPSERT_SQL).run("new-id", "media", "job", "provider-id", 11_000, 21_000, 99, "Changed machine title", "Changed Machine Artist", "{}", "2026-01-02", "2026-01-02");

const reviewed = database.prepare("SELECT * FROM song_matches WHERE id = 'match'").get() as Record<string, unknown>;
assert.equal(reviewed.review_state, "edited", "a provider rerun must preserve Owner review state");
assert.equal(reviewed.owner_title, "Owner title", "a provider rerun must preserve Owner title corrections");
assert.equal(reviewed.candidate_title, "Machine title", "a provider rerun must not alter the reviewed candidate");
assert.equal(reviewed.start_ms, 10_000, "a provider rerun must not alter reviewed timestamps");

console.log("recognition Owner-overwrite protection: passed");
