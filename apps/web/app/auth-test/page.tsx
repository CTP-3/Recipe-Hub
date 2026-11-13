import { auth, signIn, signOut } from "@project/auth";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AuthTestPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const session = await auth();
  const config = [
    ["Google client ID", process.env.AUTH_GOOGLE_ID],
    ["Google client secret", process.env.AUTH_GOOGLE_SECRET],
    ["Auth session secret", process.env.AUTH_SECRET],
  ] as const;

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
          Local development tool
        </p>
        <h1 className="text-3xl font-bold">Authentication test</h1>
        <p className="text-neutral-700">
          Use this page to test Google sign-in. It is only available in
          development and does not change the main site.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-neutral-300 p-6">
        <h2 className="text-xl font-semibold">Google OAuth configuration</h2>
        <ul className="space-y-2">
          {config.map(([label, value]) => (
            <li key={label} className="flex items-center justify-between gap-4">
              <span>{label}</span>
              <span className={value ? "text-emerald-800" : "text-red-700"}>
                {value ? "Configured" : "Missing"}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-neutral-600">
          Values are not displayed. Add missing settings to{" "}
          <code>apps/web/.env.local</code>, then restart the web server.
        </p>
      </section>

      <section className="space-y-4 rounded-lg border border-neutral-300 p-6">
        <h2 className="text-xl font-semibold">Session status</h2>
        {session?.user ? (
          <div className="space-y-3">
            <p className="text-emerald-800">Signed in</p>
            {session.user.name && <p>Name: {session.user.name}</p>}
            {session.user.email && <p>Email: {session.user.email}</p>}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/auth-test" });
              }}
            >
              <button
                type="submit"
                className="rounded bg-neutral-900 px-4 py-2 font-semibold text-white"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-3">
            <p>Signed out</p>
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/auth-test" });
              }}
            >
              <button
                type="submit"
                className="rounded bg-emerald-800 px-4 py-2 font-semibold text-white"
              >
                Sign in with Google
              </button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
