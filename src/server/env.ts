export type StreamVideo = {
  id: string;
  readyToStream: boolean;
  preview?: string;
  status: { state: string; errorReasonText?: string };
};

export interface StreamBindingService {
  upload(url: string, params?: { meta?: Record<string, string>; requireSignedURLs?: boolean; allowedOrigins?: string[] }): Promise<StreamVideo>;
  video(id: string): {
    details(): Promise<StreamVideo>;
    generateToken(): Promise<string>;
    delete(): Promise<void>;
  };
}

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  STREAM: StreamBindingService;
  ASSETS: Fetcher;
  /** Clerk's public JWT verification key (PEM). Keep this as a Wrangler secret. */
  CLERK_JWT_KEY?: string;
  /** Optional comma-separated origins/parties accepted in Clerk azp claims. */
  CLERK_AUTHORIZED_PARTIES?: string;
  ACRCLOUD_ACCESS_TOKEN?: string;
  ACRCLOUD_CONTAINER_ID?: string;
  ACRCLOUD_REGION?: string;
}
