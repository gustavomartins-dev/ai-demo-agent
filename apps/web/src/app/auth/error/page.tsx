import Link from "next/link";

const errorCopy: Record<string, string> = {
  AccessDenied: "This GitHub account is not authorized to access the private workspace.",
  Configuration: "Workspace authentication is not configured correctly. Check the server credentials and try again.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const rawError = (await searchParams).error;
  const error = Array.isArray(rawError) ? rawError[0] : rawError;
  const message = (error && errorCopy[error]) ?? "GitHub sign-in could not be completed. Please try again.";

  return (
    <main className="grid min-h-screen place-items-center bg-[#09090b] px-5 text-zinc-100">
      <section className="w-full max-w-md rounded-3xl border border-rose-400/15 bg-[#111114] p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-rose-400/10 text-xl text-rose-300">!</div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-rose-300">Access not completed</p>
        <h1 className="mt-3 text-2xl font-semibold">We could not sign you in</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">{message}</p>
        <Link className="mt-7 inline-flex rounded-xl bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white" href="/login">Try GitHub again</Link>
      </section>
    </main>
  );
}
