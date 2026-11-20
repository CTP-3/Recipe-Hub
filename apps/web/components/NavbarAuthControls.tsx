import { auth, signIn, signOut } from "@project/auth";

export default async function NavbarAuthControls({
  enabled,
}: {
  enabled: boolean;
}) {
  if (!enabled) return null;

  const session = await auth();

  if (session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/home" });
        }}
      >
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white text-white hover:bg-white/10"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-5 w-5"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c.7-3.5 3.2-5.5 7-5.5s6.3 2 7 5.5" />
          </svg>
        </button>
      </form>
    );
  }

  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/home" });
      }}
    >
      <button
        type="submit"
        aria-label="Sign in"
        title="Sign in"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-emerald-900 hover:bg-stone-100"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c.7-3.5 3.2-5.5 7-5.5s6.3 2 7 5.5" />
        </svg>
      </button>
    </form>
  );
}
