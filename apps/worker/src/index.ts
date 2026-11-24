import {
  completeFromGuestExtraction,
  completeVideoSource,
  failStaleVideoSources,
  failVideoSource,
  getVideoSourceForWorker,
  INTERRUPTED_MESSAGE,
  markVideoSourceProcessing,
  reclaimVideoSource,
  releaseVideoSource,
  touchVideoSource,
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
// A message is leased briefly and renewed while its job runs, so a job whose
// worker died becomes visible again within LEASE_SECONDS.
const LEASE_SECONDS = 120;
const HEARTBEAT_MS = 30_000;
const MAX_DELIVERIES = 3;
const SWEEP_MS = 60_000;
const ERROR_BACKOFF_MS = 5_000;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

let activeSourceId: string | null = null;

async function claim(sourceId: string, deliveries: number): Promise<boolean> {
  if ((await markVideoSourceProcessing(sourceId)).count > 0) return true;
  if (deliveries <= 1) return false;
  return (await reclaimVideoSource(sourceId, 2 * HEARTBEAT_MS)).count > 0;
}

async function processRecipeExtraction(
  message: JobMessage,
  deliveries: number,
): Promise<void> {
  if (typeof message.sourceId !== "string") {
    throw new Error("Recipe extraction job has no source ID.");
  }
  const sourceId = message.sourceId;
  if (!(await claim(sourceId, deliveries))) return;
  activeSourceId = sourceId;

  try {
    if (deliveries > MAX_DELIVERIES) throw new Error(INTERRUPTED_MESSAGE);
    const source = await getVideoSourceForWorker(sourceId);
    if (!source) throw new Error("Recipe extraction source no longer exists.");

    if (await completeFromGuestExtraction(sourceId)) {
      log.info({ sourceId }, "recipe reused from an earlier extraction");
      return;
    }

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
    if (stopping) return;
    await failVideoSource(
      sourceId,
      error instanceof Error ? error.message : "Recipe extraction failed.",
    );
    log.error(
      { sourceId, error: error instanceof Error ? error.message : "unknown" },
      "recipe extraction failed",
    );
  } finally {
    activeSourceId = null;
  }
}

async function handle(message: JobMessage, deliveries: number): Promise<void> {
  if (message.type === "recipe.extraction") {
    await processRecipeExtraction(message, deliveries);
    return;
  }
  log.warn({ type: message.type }, "worker received an unsupported job type");
}

type ReceivedMessage = {
  messageId: string;
  popReceipt: string;
  messageText: string;
  dequeueCount: number;
};

let stopping = false;
let releaseActiveMessage: (() => Promise<void>) | null = null;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processMessage(
  queue: ReturnType<typeof queueClient>,
  message: ReceivedMessage,
): Promise<void> {
  let popReceipt = message.popReceipt;
  let renewal: Promise<void> = Promise.resolve();

  const renew = async () => {
    try {
      const updated = await queue.updateMessage(
        message.messageId,
        popReceipt,
        message.messageText,
        LEASE_SECONDS,
      );
      popReceipt = updated.popReceipt ?? popReceipt;
    } catch (error) {
      log.warn(
        { error: error instanceof Error ? error.message : "unknown" },
        "job lease could not be renewed",
      );
    }
    if (activeSourceId) {
      await touchVideoSource(activeSourceId).catch(() => undefined);
    }
  };
  const heartbeat = setInterval(() => {
    renewal = renewal.then(renew);
  }, HEARTBEAT_MS);
  releaseActiveMessage = async () => {
    clearInterval(heartbeat);
    await renewal;
    await queue.updateMessage(message.messageId, popReceipt, message.messageText, 0);
  };

  try {
    let job: JobMessage | null = null;
    try {
      job = decodeJobMessage(message.messageText);
    } catch {
      log.error({ messageId: message.messageId }, "discarding unreadable job message");
    }
    if (job) await handle(job, message.dequeueCount);
    clearInterval(heartbeat);
    await renewal;
    if (!stopping) await queue.deleteMessage(message.messageId, popReceipt);
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : "unknown" },
      "job could not be persisted; leaving it on the queue for retry",
    );
  } finally {
    clearInterval(heartbeat);
    releaseActiveMessage = null;
  }
}

async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  const sourceId = activeSourceId;
  const release = releaseActiveMessage;
  if (sourceId || release) {
    log.info({ sourceId }, "worker stopping; returning its job to the queue");
    // Bounded: the database or Azurite may be shutting down at the same time.
    // If so, the expired lease hands the job to the next worker instead.
    await Promise.race([
      Promise.allSettled([
        sourceId ? releaseVideoSource(sourceId) : undefined,
        release?.(),
      ]),
      pause(3_000),
    ]);
  }
  process.exit(0);
}

async function main() {
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());

  const queue = queueClient();
  let ready = false;
  let nextSweep = 0;

  while (!stopping) {
    try {
      if (!ready) {
        await queue.createIfNotExists();
        ready = true;
        log.info(
          { queue: queue.name, pollMs: POLL_MS },
          "worker started — waiting for jobs (Ctrl+C to stop)",
        );
      }
      const batch = await queue.receiveMessages({
        numberOfMessages: 1,
        visibilityTimeout: LEASE_SECONDS,
      });
      for (const message of batch.receivedMessageItems) {
        await processMessage(queue, message);
      }
      if (batch.receivedMessageItems.length === 0) {
        // Only when the queue is empty, so a waiting redelivery goes first.
        if (Date.now() >= nextSweep) {
          nextSweep = Date.now() + SWEEP_MS;
          const failed = await failStaleVideoSources();
          if (failed > 0) log.warn({ failed }, "marked interrupted jobs as failed");
        }
        await pause(POLL_MS);
      }
    } catch (error) {
      log.error(
        { error: error instanceof Error ? error.message : "unknown" },
        "worker cannot reach the queue or database; retrying",
      );
      await pause(ERROR_BACKOFF_MS);
    }
  }
}

void main();
