import {
  completeVideoSource,
  failVideoSource,
  getVideoSourceForWorker,
  markVideoSourceProcessing,
} from "@project/domain";
import {
  deleteAttachment,
  downloadAttachment,
  extractRecipeFromLink,
  extractRecipeFromUpload,
  queueClient,
  decodeJobMessage,
  uploadAttachment,
  type JobMessage,
} from "@project/services";
import { log } from "@project/log";
import { runExtractionWithRetry } from "./extraction-retry";

const POLL_MS = 2_000;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function processRecipeExtraction(message: JobMessage): Promise<void> {
  if (typeof message.sourceId !== "string") {
    throw new Error("Recipe extraction job has no source ID.");
  }
  const sourceId = message.sourceId;
  const claimed = await markVideoSourceProcessing(sourceId);
  if (claimed.count === 0) return;

  const source = await getVideoSourceForWorker(sourceId);
  if (!source) throw new Error("Recipe extraction source no longer exists.");

  try {
    let response: unknown;
    if (source.sourceType === "UPLOAD") {
      if (!source.uploadBlobKey) throw new Error("Uploaded video is unavailable.");
      const upload = await downloadAttachment(source.uploadBlobKey);
      if (!upload) throw new Error("Uploaded video could not be read from storage.");
      if (upload.data.byteLength > MAX_VIDEO_BYTES) {
        throw new Error("Uploaded video exceeds the processing limit.");
      }
      response = await runExtractionWithRetry(
        () => extractRecipeFromUpload(upload.data, "recipe-video.mp4"),
        () =>
          log.warn({ sourceId }, "retrying transient video extraction"),
      );
    } else {
      const downloadUrl = message.downloadUrl;
      if (typeof downloadUrl !== "string") {
        throw new Error("Recipe extraction job has no download URL.");
      }
      response = await runExtractionWithRetry(
        () =>
          extractRecipeFromLink(
            downloadUrl,
            typeof message.description === "string" ? message.description : "",
          ),
        () =>
          log.warn({ sourceId }, "retrying transient video extraction"),
      );
    }

    if (!isRecord(response) || !isRecord(response.recipe)) {
      throw new Error("Extraction service returned an invalid recipe.");
    }

    let coverImageKey: string | null = null;
    const cover = response.cover_image;
    if (
      isRecord(cover) &&
      cover.mime_type === "image/jpeg" &&
      typeof cover.data === "string"
    ) {
      const image = Buffer.from(cover.data, "base64");
      if (image.byteLength > 0 && image.byteLength <= MAX_IMAGE_BYTES) {
        try {
          const bytes = image.buffer.slice(
            image.byteOffset,
            image.byteOffset + image.byteLength,
          ) as ArrayBuffer;
          coverImageKey = await uploadAttachment(
            sourceId,
            "cover.jpg",
            "image/jpeg",
            bytes,
          );
        } catch (error) {
          log.warn(
            { sourceId, error: error instanceof Error ? error.message : "unknown" },
            "recipe cover upload failed; using fallback",
          );
        }
      }
    }

    await completeVideoSource(sourceId, {
      recipe: response.recipe,
      transcript:
        typeof response.transcript === "string" ? response.transcript : undefined,
      ocrCandidates: Array.isArray(response.ocr_candidates)
        ? response.ocr_candidates
        : undefined,
      model: typeof response.model === "string" ? response.model : undefined,
      coverImageKey,
    });

    if (source.uploadBlobKey) {
      await deleteAttachment(source.uploadBlobKey).catch((error: unknown) => {
        log.warn(
          { sourceId, error: error instanceof Error ? error.message : "unknown" },
          "processed source video cleanup failed",
        );
      });
    }
    log.info({ sourceId }, "recipe extraction completed");
  } catch (error) {
    await failVideoSource(
      sourceId,
      error instanceof Error ? error.message : "Recipe extraction failed.",
    );
    log.error(
      { sourceId, error: error instanceof Error ? error.message : "unknown" },
      "recipe extraction failed",
    );
  }
}

async function handle(message: JobMessage): Promise<void> {
  if (message.type === "recipe.extraction") {
    await processRecipeExtraction(message);
    return;
  }
  log.warn({ type: message.type }, "worker received an unsupported job type");
}

async function main() {
  const queue = queueClient();
  await queue.createIfNotExists();
  log.info(
    { queue: queue.name, pollMs: POLL_MS },
    "worker started — waiting for jobs (Ctrl+C to stop)",
  );

  while (true) {
    const batch = await queue.receiveMessages({
      numberOfMessages: 1,
      visibilityTimeout: 15 * 60,
    });
    for (const message of batch.receivedMessageItems) {
      try {
        await handle(decodeJobMessage(message.messageText));
        await queue.deleteMessage(message.messageId, message.popReceipt);
      } catch (error) {
        log.error(
          { error: error instanceof Error ? error.message : "unknown" },
          "job could not be persisted; leaving it on the queue for retry",
        );
      }
    }
    if (batch.receivedMessageItems.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }
}

main().catch((error) => {
  log.error(
    { error: error instanceof Error ? error.message : "unknown" },
    "worker crashed — are Azurite and the database server running?",
  );
  process.exit(1);
});
