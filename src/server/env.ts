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
  };
}

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  STREAM: StreamBindingService;
  ASSETS: Fetcher;
  OWNER_TOKEN: string;
  ACRCLOUD_ACCESS_TOKEN?: string;
  ACRCLOUD_CONTAINER_ID?: string;
  ACRCLOUD_REGION?: string;
}
