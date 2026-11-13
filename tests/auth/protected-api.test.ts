import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../packages/auth/src/auth", () => ({ auth: vi.fn() }));

import { auth } from "../../packages/auth/src/auth";
import { POST as inspectMedia } from "../../apps/web/app/api/media/inspect/route";

describe("protected API routes", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
    vi.mocked(auth).mockResolvedValue(null);
  });

  it("rejects media inspection when there is no session", async () => {
    const response = await inspectMedia(
      new Request("http://localhost/api/media/inspect", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });
});
