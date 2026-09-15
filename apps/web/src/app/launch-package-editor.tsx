"use client";

import { useActionState } from "react";
import { saveLaunchPackageAction, type LaunchPackageActionState } from "@/app/actions";

const initialState: LaunchPackageActionState = { status: "idle", message: "" };

export type LaunchPackageEditorValue = {
  id: string;
  repositoryDescription: string;
  readmeMarkdown: string;
  releaseTag: string;
  releaseTitle: string;
  releaseNotesMarkdown: string;
};

export function LaunchPackageEditor({ value, locked }: { value: LaunchPackageEditorValue; locked: boolean }) {
  const [state, action, pending] = useActionState(saveLaunchPackageAction, initialState);
  return <form action={action} className="mt-5 space-y-4">
    <input name="packageId" type="hidden" value={value.id} />
    <label className="block text-xs text-zinc-500">Repository description
      <textarea className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-200 outline-none focus:border-violet-400/60 disabled:opacity-60" defaultValue={value.repositoryDescription} disabled={locked} maxLength={350} name="repositoryDescription" required />
    </label>
    <label className="block text-xs text-zinc-500">README.md
      <textarea className="mt-2 min-h-80 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs leading-5 text-zinc-200 outline-none focus:border-violet-400/60 disabled:opacity-60" defaultValue={value.readmeMarkdown} disabled={locked} maxLength={100000} name="readmeMarkdown" required />
    </label>
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="text-xs text-zinc-500">Release tag<input className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-200 outline-none focus:border-violet-400/60 disabled:opacity-60" defaultValue={value.releaseTag} disabled={locked} name="releaseTag" required /></label>
      <label className="text-xs text-zinc-500 sm:col-span-2">Release title<input className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-200 outline-none focus:border-violet-400/60 disabled:opacity-60" defaultValue={value.releaseTitle} disabled={locked} maxLength={120} name="releaseTitle" required /></label>
    </div>
    <label className="block text-xs text-zinc-500">Release notes
      <textarea className="mt-2 min-h-56 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs leading-5 text-zinc-200 outline-none focus:border-violet-400/60 disabled:opacity-60" defaultValue={value.releaseNotesMarkdown} disabled={locked} maxLength={50000} name="releaseNotesMarkdown" required />
    </label>
    {state.message && <p className={`text-xs ${state.status === "error" ? "text-rose-300" : "text-emerald-300"}`}>{state.message}</p>}
    {!locked && <button className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50" disabled={pending} type="submit">{pending ? "Saving…" : "Save launch package"}</button>}
  </form>;
}
