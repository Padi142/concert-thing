import { useEffect, useState } from "react";
import { recognitionSnapshot, refreshRecognition, subscribeRecognition } from "../lib/recognitionQueue";
import type { RecognitionQueueEntry } from "../lib/recognitionQueueCore";

export function useRecognition(mediaId: string | undefined, enabled: boolean): RecognitionQueueEntry | null {
  const [entry, setEntry] = useState<RecognitionQueueEntry | null>(() => mediaId ? recognitionSnapshot(mediaId) : null);

  useEffect(() => {
    if (!mediaId || !enabled) {
      setEntry(null);
      return;
    }
    setEntry(recognitionSnapshot(mediaId));
    const unsubscribe = subscribeRecognition(mediaId, setEntry);
    void refreshRecognition(mediaId);
    return unsubscribe;
  }, [mediaId, enabled]);

  return entry;
}
