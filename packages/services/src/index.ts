// Re-exports the three service adapters: queue (background jobs), storage (blobs),
// and notify (live database events). Import from @project/services, never from the SDK directly.
// Boilerplate — generic queue helpers (enqueue, encode/decode). Example branches
// add typed helpers (enqueueItemCreated, enqueueThumbnail).
export { queueClient, enqueue, type JobMessage, encodeJobMessage, decodeJobMessage } from "./queue";
export {
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
  storageAvailable,
  safeBlobName,
  MAX_ATTACHMENT_BYTES,
} from "./storage";
export { stagePayload, onStage } from "./notify";
export {
  EXTRACTION_TIMEOUT_MESSAGE,
  EXTRACTION_UNAVAILABLE_MESSAGE,
  LINK_VIDEO_TOO_LARGE_MESSAGE,
  extractRecipeFromLink,
  extractRecipeFromUpload,
  recipeServiceUrl,
} from "./recipe-extraction";