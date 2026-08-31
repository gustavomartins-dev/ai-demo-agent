import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProjectDetail } from "@/data/projects";
import { retryGenerationRunAction } from "@/app/actions";
import { RetryButton } from "@/app/retry-button";
import { SocialDraftEditor } from "@/app/social-draft-editor";
import { SocialDraftApproval } from "@/app/social-draft-approval";
import { SocialDraftPublish } from "@/app/social-draft-publish";

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

const statusCopy: Record<string, string> = {
  QUEUED: "Waiting for an available worker.",
  ANALYZING: "The worker is preparing project context.",
  PLANNING: "Hermes is building and validating the demo plan.",
  PLANNED: "The validated plan is waiting for browser recording.",
  RECORDING: "Playwright is recording the verified browser flow.",
  DRAFTING: "Hermes is writing evidence-grounded English social drafts.",
  READY_FOR_REVIEW: "Video, evidence, and social drafts are ready for your review.",
  FAILED: "Processing stopped after the available automatic attempts.",
};

type Mention = { identity: string; reason: string };
type Evidence = { id: string; statement: string; evidenceStorageKey: string };

function mentions(value: unknown): Mention[] {
  return Array.isArray(value)
    ? value.filter((item): item is Mention => Boolean(item && typeof item === "object" && "identity" in item && "reason" in item))
    : [];
}

function evidence(value: unknown): Evidence[] {
  return Array.isArray(value)
    ? value.filter((item): item is Evidence => Boolean(item && typeof item === "object" && "id" in item && "statement" in item && "evidenceStorageKey" in item))
    : [];
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=/projects/${id}`);
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
                    <div className="flex flex-col items-start gap-2 sm:items-end"><Status value={run.status} /><span className="text-[11px] text-zinc-600">Attempt {run.attemptCount} of {run.maxAttempts}</span></div>
                  </div>
                  <p className="mt-4 text-xs text-zinc-500">{statusCopy[run.status] ?? "Generation is moving through the launch pipeline."}</p>
                  {run.status === "QUEUED" && run.attemptCount > 0 && <p className="mt-1 text-[11px] text-zinc-600">Next automatic retry: {new Date(run.nextAttemptAt).toLocaleString("en-US")}</p>}
                  {run.error && <div className="mt-5 rounded-xl border border-rose-400/15 bg-rose-400/[0.06] p-4 text-sm text-rose-300">{run.error}</div>}
                  {run.status === "FAILED" && <form action={retryGenerationRunAction} className="mt-4"><input name="runId" type="hidden" value={run.id} /><RetryButton /></form>}

                  <div className="mt-6">
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-5">
                      <div className="flex items-center justify-between"><h4 className="text-sm font-medium">Media and evidence</h4><span className="text-xs text-zinc-600">{run.assets.length} files</span></div>
                      {run.assets.length === 0 ? <p className="mt-5 text-sm text-zinc-600">Artifacts will appear after recording starts.</p> : <>
                        {run.assets.find((asset) => asset.type === "VIDEO" && asset.status === "READY") && <video className="mt-4 aspect-video w-full rounded-xl bg-black" controls preload="metadata" src={`/api/media/${run.assets.find((asset) => asset.type === "VIDEO" && asset.status === "READY")?.id}`} />}
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">{run.assets.map((asset) => <div key={asset.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5"><div className="min-w-0"><p className="text-xs font-medium capitalize">{label(asset.type)}</p><p className="mt-0.5 truncate text-[10px] text-zinc-600">{asset.storageKey}</p></div><div className="flex shrink-0 items-center gap-2"><Status value={asset.status} />{asset.status === "READY" && <a className="text-xs text-violet-400 hover:text-violet-300" href={`/api/media/${asset.id}`} target="_blank" rel="noreferrer">Open ↗</a>}</div></div>)}</div>
                      </>}
                    </div>
                    <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-medium">Social review</h4><p className="mt-1 text-xs text-zinc-600">Compare and edit each English draft independently.</p></div><span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200">Explicit approval and publish required</span></div>
                      <div className="mt-5 grid gap-5 xl:grid-cols-2">
                        {(["X", "LINKEDIN"] as const).map((platform) => {
                          const draft = run.socialDrafts.find((item) => item.platform === platform);
                          const draftMentions = mentions(draft?.mentions);
                          const draftEvidence = evidence(draft?.evidence);
                          return <section key={platform} className="rounded-2xl border border-white/8 bg-[#111114] p-5">
                            <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">{platform === "LINKEDIN" ? "LinkedIn" : "X"}</p><p className="mt-1 text-[11px] text-zinc-600">{platform === "LINKEDIN" ? "Formal product narrative" : "Concise launch update"}</p></div>{draft ? <Status value={draft.status} /> : <span className="text-[10px] text-zinc-600">Not generated</span>}</div>
                            {draft ? <>
                              <SocialDraftEditor draftId={draft.id} platform={platform} initialContent={draft.content} />
                              <SocialDraftApproval draftId={draft.id} approvedAt={draft.approvedAt} />
                              <SocialDraftPublish draftId={draft.id} status={draft.status} publishedUrl={draft.publishedPostUrl} />
                              {draft.repositoryUrl && <div className="mt-5"><p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Repository</p><a className="mt-2 block break-all text-xs text-violet-400 hover:text-violet-300" href={draft.repositoryUrl} target="_blank" rel="noreferrer">{draft.repositoryUrl} ↗</a></div>}
                              <div className="mt-5"><p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Suggested mentions</p>{draftMentions.length ? <ul className="mt-2 space-y-2">{draftMentions.map((mention) => <li className="rounded-lg bg-white/[0.03] p-3 text-xs" key={`${mention.identity}-${mention.reason}`}><span className="font-medium text-zinc-300">{mention.identity}</span><span className="text-zinc-600"> — {mention.reason}</span></li>)}</ul> : <p className="mt-2 text-xs text-zinc-600">No verified mentions suggested.</p>}</div>
                              <div className="mt-5"><p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Verified evidence used</p>{draftEvidence.length ? <ul className="mt-2 space-y-2">{draftEvidence.map((claim) => <li className="rounded-lg border border-white/6 p-3" key={claim.id}><p className="text-xs leading-5 text-zinc-400">{claim.statement}</p><p className="mt-1 break-all font-mono text-[10px] text-zinc-700">{claim.evidenceStorageKey}</p></li>)}</ul> : <p className="mt-2 text-xs text-zinc-600">No evidence provenance available.</p>}</div>
                            </> : <p className="mt-5 text-sm text-zinc-600">This draft will appear after the verified recording finishes.</p>}
                          </section>;
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
