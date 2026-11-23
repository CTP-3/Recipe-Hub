const RETRYABLE_MESSAGES = new Set([
  "Classroom AI rate limit reached. Please try again later.",
  "Panoscribe API request failed.",
  "Panoscribe transcription failed.",
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
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientExtractionError(error)) throw error;
    onRetry(error);
    await new Promise((resolve) => setTimeout(resolve, 250));
    return operation();
  }
}
