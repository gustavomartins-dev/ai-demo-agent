const pipelineSteps = [
  { label: "Understand", detail: "Hermes reads the product" },
  { label: "Record", detail: "Playwright proves the flow" },
  { label: "Write", detail: "English drafts for X and LinkedIn" },
  { label: "Review", detail: "You approve every publication" },
];

function Mark() {
  return (
    <div className="grid size-10 place-items-center rounded-xl bg-violet-500 text-sm font-bold text-white shadow-[0_10px_30px_rgba(139,92,246,0.35)]">
      AD
    </div>
  );
}

function readableStatus(status: string | null): string {
  return (status ?? "Not started").toLowerCase().replaceAll("_", " ");
}

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/");
  const dashboard = await getDashboardData(session.user.id);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-white/8 px-5 py-6 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2">
            <Mark />
            <div>
              <p className="font-semibold tracking-tight">AI Demo Agent</p>
              <p className="text-xs text-zinc-500">Launch workspace</p>
            </div>
          </div>
          <nav className="mt-10 space-y-1 text-sm">
            <a className="flex items-center gap-3 rounded-xl bg-white/7 px-3 py-2.5 font-medium text-white" href="#dashboard"><span className="size-2 rounded-full bg-violet-400" />Dashboard</a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-zinc-400 transition hover:bg-white/5 hover:text-white" href="#projects"><span className="size-2 rounded-full border border-zinc-600" />Projects</a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-zinc-400 transition hover:bg-white/5 hover:text-white" href="#review"><span className="size-2 rounded-full border border-zinc-600" />Review queue</a>
          </nav>
          <div className="mt-auto rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Connections</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between"><span>LinkedIn</span><span className="text-zinc-600">Not connected</span></div>
              <div className="flex items-center justify-between"><span>X</span><span className="text-zinc-600">Not connected</span></div>
            </div>
          </div>
        </aside>

        <main id="dashboard" className="min-w-0 flex-1 px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 lg:hidden"><Mark /><span className="font-semibold">AI Demo Agent</span></div>
            <div className="hidden lg:block"><p className="text-sm text-zinc-500">Personal workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Launch dashboard</h1></div>
            <div className="flex items-center gap-3"><a href="#new-project" className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(139,92,246,0.25)] transition hover:bg-violet-400">New project</a><AccountMenu name={session.user.name} email={session.user.email} /></div>
          </header>

          <section className="mt-8 grid gap-4 sm:grid-cols-3">
            {[["Projects", dashboard.counts.projects, "Products in your workspace"], ["Ready for review", dashboard.counts.readyForReview, "Waiting for your approval"], ["Published", dashboard.counts.published, "Approved social launches"]].map(([label, value, detail]) => (
              <article key={label} className="rounded-2xl border border-white/8 bg-white/[0.035] p-5">
                <p className="text-sm text-zinc-500">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-2 text-xs text-zinc-600">{detail}</p>
              </article>
            ))}
          </section>

          {!dashboard.databaseConfigured && (
            <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-5 py-4 text-sm text-amber-100/80">
              PostgreSQL is not configured yet. Follow <code className="rounded bg-black/30 px-1.5 py-1 text-xs">apps/web/.env.example</code> to enable project creation.
            </div>
          )}

          <section id="new-project" className="mt-6 rounded-3xl border border-white/8 bg-[#111114] p-6">
            <div className="mb-6"><p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-400">New launch</p><h2 className="mt-2 text-lg font-semibold">Add a project</h2><p className="mt-1 text-sm text-zinc-500">The first run will be queued with your launch objective.</p></div>
            <ProjectForm databaseConfigured={dashboard.databaseConfigured} />
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]">
            <div id="projects" className="overflow-hidden rounded-3xl border border-white/8 bg-[#111114]">
              <div className="border-b border-white/8 px-6 py-5"><h2 className="font-semibold">Your projects</h2><p className="mt-1 text-sm text-zinc-500">Every launch stays here from discovery to publication.</p></div>
              {dashboard.projects.length === 0 ? (
                <div className="grid min-h-80 place-items-center px-6 py-12 text-center"><div className="max-w-sm">
                  <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-violet-400/20 bg-violet-400/10 text-2xl text-violet-300">+</div>
                  <h3 className="mt-5 text-lg font-semibold">Create your first launch</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">Add a repository and product URL. The agent will understand the project, record a verified demo, and prepare both social drafts.</p>
                  <a href="#new-project" className="mt-6 inline-block rounded-xl border border-white/10 bg-white/7 px-4 py-2.5 text-sm font-medium transition hover:bg-white/10">Add a project</a>
                </div></div>
              ) : (
                <div className="divide-y divide-white/8">
                  {dashboard.projects.map((project) => (
                    <article key={project.id} className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                      <div><div className="flex items-center gap-2"><Link className="font-medium hover:text-violet-300" href={`/projects/${project.id}`}>{project.name}</Link>{project.isOpenSource && <span className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-300">Open source</span>}</div><a className="mt-1 block max-w-md truncate text-xs text-zinc-600 hover:text-zinc-400" href={project.productUrl} target="_blank" rel="noreferrer">{project.productUrl}</a></div>
                      <div className="text-left sm:text-right"><p className="text-xs font-medium capitalize text-zinc-300">{readableStatus(project.latestRunStatus)}</p><p className="mt-1 text-[11px] text-zinc-600">Updated {new Date(project.updatedAt).toLocaleDateString("en-US")}</p></div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div id="review" className="rounded-3xl border border-white/8 bg-[#111114] p-6">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-400">Launch pipeline</p>
              <h2 className="mt-2 text-lg font-semibold">From project to published story</h2>
              <div className="mt-7 space-y-6">
                {pipelineSteps.map((step, index) => (
                  <div key={step.label} className="relative flex gap-4">
                    {index < pipelineSteps.length - 1 && <div className="absolute left-[15px] top-8 h-10 w-px bg-white/10" />}
                    <div className="relative grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-xs text-zinc-400">{index + 1}</div>
                    <div><p className="text-sm font-medium">{step.label}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{step.detail}</p></div>
                  </div>
                ))}
              </div>
              <div className="mt-8 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] p-4 text-xs leading-5 text-emerald-200/75">Nothing is published until you approve the final video and each platform draft.</div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDashboardData } from "@/data/projects";
import { ProjectForm } from "./project-form";
import { AccountMenu } from "./account-menu";
