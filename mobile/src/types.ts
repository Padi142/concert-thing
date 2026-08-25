export type Show = {
  id: string;
  title: string;
  venue: string;
  locality: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  artists: string[];
};

export type MediaItem = {
  id: string;
  original_name: string;
  media_type: "photo" | "video";
  content_type: string;
  byte_size: number;
  duration_ms: number | null;
  captured_at: string | null;
  status: string;
  stream_status: string | null;
  show_id: string | null;
  show_title: string | null;
  assignment_method: "automatic" | "owner" | null;
  created_at: string;
};

export type SongMatch = {
  id: string;
  media_id: string;
  start_ms: number;
  end_ms: number | null;
  confidence: number | null;
  candidate_title: string | null;
  candidate_artist: string | null;
  review_state: "pending" | "confirmed" | "rejected" | "edited" | "manual";
  song_id: string | null;
  title: string;
  artist: string;
};

export type RecognitionJob = {
  id: string;
  media_id: string;
  status: "preparing" | "submitted" | "processing" | "completed" | "no_match" | "unsupported" | "budget_exhausted" | "failed";
  attempt_count: number;
  last_error: string | null;
};

export type QueueState = "queued" | "uploading" | "paused" | "retrying" | "blocked" | "complete" | "duplicate" | "failed" | "cancelled";

export type StorageSnapshot = {
  effectiveQuotaBytes: number;
  usedBytes: number;
  reservedBytes: number;
  availableBytes: number;
  overQuota: boolean;
  plan: { key: string; name: string };
};

export type QueueUpload = {
  id: string;
  account_id: string | null;
  local_uri: string;
  original_name: string;
  content_type: string;
  byte_size: number;
  content_hash: string | null;
  captured_at: string | null;
  duration_ms: number | null;
  show_id: string | null;
  state: QueueState;
  upload_id: string | null;
  media_id: string | null;
  chunk_size: number | null;
  retry_count: number;
  next_retry_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
  completed_parts?: number;
  total_parts?: number;
};

export type QueuePart = {
  queue_id: string;
  part_number: number;
  byte_start: number;
  byte_end: number;
  etag: string | null;
  state: "pending" | "uploading" | "complete" | "failed";
  retry_count: number;
  updated_at: number;
};

export type ApiConfig = {
  baseUrl: string;
};

export type ShowShare = {
  shared: boolean;
  url: string | null;
};

export type VideoShare = {
  shared: boolean;
  url: string | null;
};

export type UploadInitResponse = {
  mediaId: string;
  uploadId: string | null;
  chunkSize: number;
  completed?: { partNumber: number; etag: string }[];
  status?: "uploading" | "ready";
  assignment?: { showId: string; method: string } | null;
};
