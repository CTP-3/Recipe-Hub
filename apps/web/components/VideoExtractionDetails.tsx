type OcrCandidate = {
  time: number;
  text: string;
};

export default function VideoExtractionDetails({
  transcript,
  ocrCandidates = [],
}: {
  transcript?: string;
  ocrCandidates?: OcrCandidate[];
}) {
  return (
    <section aria-labelledby="video-extraction-heading" className="space-y-3">
      <h3 id="video-extraction-heading" className="text-2xl font-bold text-green-950">
        Video Extraction Details
      </h3>
      <details className="rounded-lg border border-stone-200 p-4">
        <summary className="cursor-pointer font-medium">View Transcript</summary>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
          {transcript || "No transcript available."}
        </p>
      </details>
      <details className="rounded-lg border border-stone-200 p-4">
        <summary className="cursor-pointer font-medium">
          View On-Screen Text (OCR)
        </summary>
        {ocrCandidates.length ? (
          <ul className="mt-3 space-y-2 text-sm text-neutral-700">
            {ocrCandidates.map((candidate, index) => (
              <li key={`${candidate.time}-${index}`}>
                <span className="mr-2 text-neutral-500">
                  {candidate.time}s
                </span>
                {candidate.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-neutral-600">
            No on-screen text was identified.
          </p>
        )}
      </details>
    </section>
  );
}
