// Resolves the current user exclusively from the Auth.js database session.
import { auth } from "./auth";

export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
