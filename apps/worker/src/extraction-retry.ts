const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;

// Classroom AI failures are absent on purpose: retrying them here would repeat
// the download and transcription and spend another AI request.
const RETRYABLE_MESSAGES = new Set([
  "Panoscribe API request failed.",
  "Recipe extraction service is unavailable.",
  "Video download failed.",
]);

export function isTransientExtractionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    RETRYABLE_MESSAGES.has(error.message) ||
    /^Recipe extraction failed \(HTTP (?:408|425|429|5\d\d)\)\.$/.test(
      error.message,
    )
  );
}

export async function runExtractionWithRetry<T>(
  operation: () => Promise<T>,
  onRetry: (error: unknown) => void,
  delayMs = RETRY_DELAY_MS,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isTransientExtractionError(error)) throw error;
      onRetry(error);
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}
