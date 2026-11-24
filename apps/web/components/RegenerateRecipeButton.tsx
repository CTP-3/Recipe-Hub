"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  sourceId: string;
};

type JobStatus = "queued" | "processing" | "ready" | "failed";
const JOB_STATUSES: JobStatus[] = ["queued", "processing", "ready", "failed"];

function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && JOB_STATUSES.some((status) => status === value);
}

export default function RegenerateRecipeButton({ sourceId }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  async function regenerate() {
    if (busy) return;
    const requestController = new AbortController();
    controller.current = requestController;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/recipes/jobs/${encodeURIComponent(sourceId)}/regenerate`,
        { method: "POST", signal: requestController.signal },
      );
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "This recipe is no longer available to regenerate."
            : "Unable to start recipe regeneration.",
        );
      }

      while (!requestController.signal.aborted) {
        const statusResponse = await fetch(
          `/api/recipes/jobs/${encodeURIComponent(sourceId)}`,
          { cache: "no-store", signal: requestController.signal },
        );
        if (!statusResponse.ok) {
          throw new Error("Unable to check recipe regeneration status.");
        }
        const result: unknown = await statusResponse.json();
        if (
          !result ||
          typeof result !== "object" ||
          !("status" in result) ||
          !isJobStatus(result.status)
        ) {
          throw new Error("The server returned an invalid recipe status.");
        }
        const status = result.status;
        if (status === "ready") {
          // The previous recipe is kept when regeneration fails.
          if ("error" in result && typeof result.error === "string") {
            throw new Error(`Recipe regeneration failed. ${result.error}`);
          }
          setMessage("Recipe refreshed.");
          window.location.reload();
          return;
        }
        if (status === "failed") {
          throw new Error("Recipe regeneration failed. Please try again.");
        }
        setMessage(
          status === "queued"
            ? "Regeneration queued..."
            : "Regenerating recipe...",
        );
        await new Promise<void>((resolve, reject) => {
          const signal = requestController.signal;
          const onAbort = () => {
            window.clearTimeout(timeout);
            reject(new DOMException("Aborted", "AbortError"));
          };
          const timeout = window.setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
          }, 2_000);
          signal.addEventListener("abort", onAbort, { once: true });
        });
      }
    } catch (error) {
      if (
        !(error instanceof DOMException && error.name === "AbortError")
      ) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to regenerate recipe.",
        );
      }
    } finally {
      if (controller.current === requestController) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => void regenerate()}
        disabled={busy}
        className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-60"
      >
        {busy ? "Regenerating..." : "Regenerate from video"}
      </button>
      {message && (
        <p
          role={message.includes("failed") || message.includes("Unable") ? "alert" : "status"}
          className="mt-2 text-sm text-stone-600"
        >
          {message}
        </p>
      )}
    </div>
  );
}
