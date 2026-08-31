import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProjectDetail } from "@/data/projects";

export const dynamic = "force-dynamic";

function label(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function tone(status: string): string {
  if (["PUBLISHED", "READY", "READY_FOR_REVIEW", "APPROVED"].includes(status)) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (status === "FAILED") return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  return "border-violet-400/20 bg-violet-400/10 text-violet-300";
}

function Status({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${tone(value)}`}>{label(value)}</span>;
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/api/auth/signin?callbackUrl=/projects/${id}`);
  const project = await getProjectDetail(session.user.id, id);
  if (!project) notFound();

  return (
    <main className="min-h-screen bg-[#09090b] px-5 py-8 text-zinc-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <Link className="text-sm text-zinc-500 transition hover:text-white" href="/">← Back to dashboard</Link>
        <header className="mt-8 flex flex-col gap-5 border-b border-white/8 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1><Status value={project.status} /></div>
            <a className="mt-3 block text-sm text-zinc-500 hover:text-zinc-300" href={project.productUrl} target="_blank" rel="noreferrer">{project.productUrl}</a>
            {project.repositoryUrl && <a className="mt-1 block text-sm text-violet-400 hover:text-violet-300" href={project.repositoryUrl} target="_blank" rel="noreferrer">View repository ↗</a>}
          </div>
          <div className="text-sm text-zinc-500">{project.runs.length} generation {project.runs.length === 1 ? "run" : "runs"}</div>
        </header>

        <section className="mt-8">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-400">History</p>
          <h2 className="mt-2 text-xl font-semibold">Generation runs</h2>
          {project.runs.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-white/10 p-12 text-center text-sm text-zinc-500">No generation has started for this project yet.</div>
          ) : (
            <div className="mt-6 space-y-5">
              {project.runs.map((run, index) => (
                <article key={run.id} className="rounded-3xl border border-white/8 bg-[#111114] p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div><p className="text-xs text-zinc-600">Run #{project.runs.length - index} · {new Date(run.createdAt).toLocaleString("en-US")}</p><h3 className="mt-2 max-w-2xl font-medium leading-6">{run.objective}</h3></div>
                    <Status value={run.status} />
                  </div>
                  {run.error && <div className="mt-5 rounded-xl border border-rose-400/15 bg-rose-400/[0.06] p-4 text-sm text-rose-300">{run.error}</div>}

                  <div className="mt-6 grid gap-5 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-5">
                      <div className="flex items-center justify-between"><h4 className="text-sm font-medium">Media and evidence</h4><span className="text-xs text-zinc-600">{run.assets.length} files</span></div>
                      {run.assets.length === 0 ? <p className="mt-5 text-sm text-zinc-600">Artifacts will appear after recording starts.</p> : <div className="mt-4 space-y-2">{run.assets.map((asset) => <div key={asset.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5"><div><p className="text-xs font-medium capitalize">{label(asset.type)}</p><p className="mt-0.5 max-w-64 truncate text-[10px] text-zinc-600">{asset.storageKey}</p></div><Status value={asset.status} /></div>)}</div>}
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-5">
                      <div className="flex items-center justify-between"><h4 className="text-sm font-medium">Social drafts</h4><span className="text-xs text-zinc-600">English only</span></div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {["X", "LINKEDIN"].map((platform) => {
                          const draft = run.socialDrafts.find((item) => item.platform === platform);
                          return <div key={platform} className="rounded-xl border border-white/8 p-3"><div className="flex items-center justify-between"><p className="text-xs font-semibold">{platform === "LINKEDIN" ? "LinkedIn" : "X"}</p>{draft ? <Status value={draft.status} /> : <span className="text-[10px] text-zinc-600">Not generated</span>}</div>{draft && <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-zinc-500">{draft.content}</p>}{draft?.publishedPostUrl && <a className="mt-3 inline-block text-xs text-violet-400" href={draft.publishedPostUrl} target="_blank" rel="noreferrer">View published post ↗</a>}</div>;
                        })}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
