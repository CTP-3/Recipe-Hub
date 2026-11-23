import {
  listTikTokSourcesMissingAttribution,
  updateVideoSourceAttribution,
} from "@project/domain";
import { prisma } from "@project/db";
import { fetchSourceCreatorMetadata } from "../apps/web/lib/inspect-video";

async function main() {
  let afterId: string | undefined;
  let updated = 0;
  let unavailable = 0;

  while (true) {
    const sources = await listTikTokSourcesMissingAttribution(afterId);
    if (sources.length === 0) break;

    for (const source of sources) {
      afterId = source.id;
      const sourceUrl =
        source.sourceVideoUrl ?? source.canonicalUrl ?? source.originalUrl;
      if (!sourceUrl) {
        unavailable += 1;
        continue;
      }
      try {
        const attribution = await fetchSourceCreatorMetadata(sourceUrl);
        const saved = await updateVideoSourceAttribution(source.id, attribution);
        if (saved?.sourceCreatorUsername || saved?.sourceCreatorName) {
          updated += 1;
        } else {
          unavailable += 1;
        }
      } catch (error) {
        unavailable += 1;
        console.warn(
          `Could not backfill TikTok source ${source.id}:`,
          error instanceof Error ? error.message : "unknown error",
        );
      }
    }

    if (sources.length < 50) break;
  }

  console.info(
    `TikTok attribution backfill complete: ${updated} updated, ${unavailable} unavailable.`,
  );
}

main().catch((error: unknown) => {
  console.error(
    "TikTok attribution backfill failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
