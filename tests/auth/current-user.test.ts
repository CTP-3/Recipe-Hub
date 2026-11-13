import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../packages/auth/src/auth", () => ({ auth: vi.fn() }));

import { auth } from "../../packages/auth/src/auth";
import { currentUserId } from "../../packages/auth/src/current-user";

describe("currentUserId", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("returns the id from the current session", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof auth>>);

    await expect(currentUserId()).resolves.toBe("user-1");
  });

  it("returns null when no session exists", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    await expect(currentUserId()).resolves.toBeNull();
  });
});
