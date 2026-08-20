export type Report = (message: string, error?: boolean) => void;
export type Show = { id: string; title: string; venue: string; locality: string; starts_at: string; ends_at: string | null; timezone: string; artists: string[] };
export type MediaItem = { id: string; original_name: string; media_type: "photo" | "video"; content_type: string; byte_size: number; duration_ms: number | null; captured_at: string | null; status: string; show_id: string | null; show_title: string | null; assignment_method: "automatic" | "owner" | null; created_at: string };
export type RecognitionStatus = "preparing" | "submitted" | "processing" | "completed" | "no_match" | "unsupported" | "budget_exhausted" | "failed";
export type SongMatch = { id: string; media_id: string; start_ms: number; end_ms: number | null; confidence: number | null; candidate_title: string | null; candidate_artist: string | null; review_state: "pending" | "confirmed" | "rejected" | "edited" | "manual"; song_id: string | null; title: string; artist: string };
export type UploadState = { mediaId: string; uploadId: string; chunkSize: number; completed: { partNumber: number; etag: string }[] };
