import type { DecisionBindingService, Env } from "../env";
import { ask, chosenOption, MAX_QUESTIONS, yesProbability } from "./clef";
import type { Question } from "./clef";

/** A Show choice below this probability leaves the Media Item for Owner review. */
export const AUTO_ASSIGN_PROBABILITY = 0.85;
/** Shows this far outside their window still count as evidence-backed candidates. */
const CAPTURE_MARGIN_SECONDS = 3 * 60 * 60;
const MAX_CANDIDATE_SHOWS = 8;
const NO_SHOW = "none";

type MediaRow = {
  original_name: string;
  captured_at: string | null;
  captured_at_source: string | null;
  show_id: string | null;
  assignment_method: string | null;
};

type ShowRow = {
  id: string;
  title: string;
  venue: string;
  locality: string;
  starts_at: string;
  ends_at: string | null;
  artists_json: string;
};

type MatchRow = {
  id: string;
  start_ms: number;
  confidence: number | null;
  candidate_title: string;
  candidate_artist: string | null;
};

const SHOW_COLUMNS = `
  s.id,s.title,s.venue,s.locality,s.starts_at,s.ends_at,
  COALESCE((SELECT json_group_array(a.name)
    FROM show_artists sa JOIN artists a ON a.id = sa.artist_id
    WHERE sa.show_id = s.id), '[]') AS artists_json
`;

function describeShow(show: ShowRow) {
  return {
    title: show.title,
    artists: JSON.parse(show.artists_json) as string[],
    venue: show.venue,
    locality: show.locality,
    startsAt: show.starts_at,
    endsAt: show.ends_at,
  };
}

function describeMatch(match: MatchRow) {
  return {
    title: match.candidate_title,
    artist: match.candidate_artist,
    startsAtSeconds: Math.round(match.start_ms / 1_000),
    recognitionScore: match.confidence,
  };
}

function showSummary(show: ShowRow): string {
  const { artists } = describeShow(show);
  const place = [show.venue, show.locality].filter(Boolean).join(", ");
  return `${show.title}${artists.length ? ` with ${artists.join(", ")}` : ""} at ${place}, starting ${show.starts_at}`;
}

export function assignmentRequest(media: MediaRow, shows: ShowRow[], matches: MatchRow[]) {
  const options = new Map(shows.map((show, index) => [`show_${index + 1}`, show]));
  const criteria: Record<string, string> = {};
  for (const [key, show] of options) criteria[key] = showSummary(show);
  criteria[NO_SHOW] = "None of these Shows, or the evidence does not single one out";
  const questions: Record<string, Question> = {
    show: {
      type: "choice",
      instructions: "Which Show was this video recorded at? The songs were recognized from the video's audio, so a song by one of a Show's Artists is strong evidence for that Show.",
      criteria,
    },
  };
  return {
    state: {
      video: { filename: media.original_name, capturedAt: media.captured_at, capturedAtSource: media.captured_at_source },
      shows: Object.fromEntries([...options].map(([key, show]) => [key, describeShow(show)])),
      recognizedSongs: matches.map(describeMatch),
    },
    questions,
    options,
  };
}

export function plausibilityRequest(show: ShowRow, matches: MatchRow[]) {
  const keyed = new Map(matches.map((match, index) => [`match_${index + 1}`, match]));
  const questions: Record<string, Question> = {};
  for (const [key, match] of keyed) {
    questions[key] = {
      type: "noul",
      instructions: `Was "${match.candidate_title}" by ${match.candidate_artist || "an unknown artist"} plausibly performed live at this Show? Candidates come from audio fingerprinting of a live recording and are often wrong.`,
    };
  }
  return {
    state: {
      show: describeShow(show),
      recognizedSongs: Object.fromEntries([...keyed].map(([key, match]) => [key, describeMatch(match)])),
    },
    questions,
    keyed,
  };
}

async function assignFromEvidence(ai: DecisionBindingService, db: D1Database, mediaId: string, ownerId: string, media: MediaRow, matches: MatchRow[]): Promise<string | null> {
  const shows = (await db.prepare(`
    SELECT ${SHOW_COLUMNS} FROM shows s
    WHERE s.owner_id = ? AND unixepoch(?) BETWEEN unixepoch(s.starts_at) - ?
      AND unixepoch(COALESCE(s.ends_at, datetime(s.starts_at, '+6 hours'))) + ?
    ORDER BY s.starts_at LIMIT ?
  `).bind(ownerId, media.captured_at, CAPTURE_MARGIN_SECONDS, CAPTURE_MARGIN_SECONDS, MAX_CANDIDATE_SHOWS).all<ShowRow>()).results;
  if (!shows.length) return null;
  const request = assignmentRequest(media, shows, matches);
  const chosen = chosenOption((await ask(ai, request.state, request.questions)).show);
  const show = chosen && chosen.probability >= AUTO_ASSIGN_PROBABILITY ? request.options.get(chosen.option) : undefined;
  if (!show) return null;
  const result = await db.prepare(
    "UPDATE media_items SET show_id = ?, assignment_method = 'automatic' WHERE id = ? AND owner_id = ? AND show_id IS NULL AND assignment_method IS NULL",
  ).bind(show.id, mediaId, ownerId).run();
  return result.meta.changes ? show.id : null;
}

async function judge(ai: DecisionBindingService, db: D1Database, mediaId: string, ownerId: string): Promise<void> {
  const media = await db.prepare(`
    SELECT original_name,captured_at,captured_at_source,show_id,assignment_method FROM media_items
    WHERE id = ? AND owner_id = ? AND status = 'ready' AND deletion_started_at IS NULL
  `).bind(mediaId, ownerId).first<MediaRow>();
  if (!media) return;
  const matches = (await db.prepare(`
    SELECT id,start_ms,confidence,candidate_title,candidate_artist FROM song_matches
    WHERE media_id = ? AND review_state = 'pending' AND candidate_title IS NOT NULL
    ORDER BY start_ms LIMIT ?
  `).bind(mediaId, MAX_QUESTIONS).all<MatchRow>()).results;
  if (!matches.length) return;

  let showId = media.show_id;
  if (!showId && !media.assignment_method && media.captured_at) {
    showId = await assignFromEvidence(ai, db, mediaId, ownerId, media, matches);
  }
  if (!showId) return;
  const show = await db.prepare(`SELECT ${SHOW_COLUMNS} FROM shows s WHERE s.id = ? AND s.owner_id = ?`).bind(showId, ownerId).first<ShowRow>();
  if (!show) return;

  const request = plausibilityRequest(show, matches);
  const answers = await ask(ai, request.state, request.questions);
  const statements: D1PreparedStatement[] = [];
  for (const [key, match] of request.keyed) {
    const plausibility = yesProbability(answers[key]);
    if (plausibility === null) continue;
    statements.push(db.prepare("UPDATE song_matches SET plausibility = ? WHERE id = ? AND review_state = 'pending'").bind(plausibility, match.id));
  }
  if (statements.length) await db.batch(statements);
}

/**
 * Judge a video's pending Song Matches against its Show, first settling an
 * open Assignment when the matches single one Show out. Decisions only refine
 * Owner review, so a missing binding or a failed call leaves everything as is.
 */
export async function judgeSongMatches(env: Env, mediaId: string, ownerId: string): Promise<void> {
  if (!env.AI) return;
  try {
    await judge(env.AI, env.DB, mediaId, ownerId);
  } catch (error) {
    console.warn("Song Match decisions skipped", error);
  }
}

/** An Owner Assignment changes the Show that pending candidates are judged against. */
export async function rejudgeSongMatches(env: Env, mediaId: string, ownerId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE song_matches SET plausibility = NULL WHERE media_id = ? AND review_state = 'pending' AND plausibility IS NOT NULL",
  ).bind(mediaId).run();
  await judgeSongMatches(env, mediaId, ownerId);
}
