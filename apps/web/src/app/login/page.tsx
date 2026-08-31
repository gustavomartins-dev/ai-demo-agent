import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { safeLocalRedirect } from "@/lib/safe-redirect";

function GitHubMark() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.78 1.2 1.78 1.2 1.04 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.38-5.29 5.67.42.36.79 1.06.79 2.14v3.17c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const session = await auth();
  const requestedUrl = (await searchParams).callbackUrl;
  const redirectTo = safeLocalRedirect(Array.isArray(requestedUrl) ? requestedUrl[0] : requestedUrl);
  if (session?.user?.id) redirect(redirectTo);

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#09090b] px-5 py-12 text-zinc-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(139,92,246,0.2),transparent_38%)]" />
      <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#111114]/95 p-7 shadow-2xl shadow-black/40 sm:p-9">
        <div className="grid size-12 place-items-center rounded-2xl bg-violet-500 font-bold shadow-[0_12px_36px_rgba(139,92,246,0.3)]">AD</div>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">Private workspace</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sign in to AI Demo Agent</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          Continue with the authorized GitHub account to manage projects, review demos, and approve social posts.
        </p>

        <form
          className="mt-8"
          action={async (formData) => {
            "use server";
            await signIn("github", { redirectTo: safeLocalRedirect(formData.get("redirectTo")) });
          }}
        >
          <input name="redirectTo" type="hidden" value={redirectTo} />
          <button className="flex w-full items-center justify-center gap-3 rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white" type="submit">
            <GitHubMark /> Continue with GitHub
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-xs leading-5 text-zinc-500">
          Access is restricted to the GitHub username configured by the workspace owner. No project is published without explicit approval.
        </div>
      </section>
    </main>
  );
}
