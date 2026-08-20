export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  OWNER_TOKEN: string;
  ACRCLOUD_ACCESS_TOKEN?: string;
  ACRCLOUD_CONTAINER_ID?: string;
  ACRCLOUD_REGION?: string;
  RECOGNITION_MONTHLY_LIMIT?: string;
}
