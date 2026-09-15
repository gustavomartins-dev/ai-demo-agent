"use client";

import { useActionState } from "react";
import { publishLaunchPackageAction, type LaunchPackageActionState } from "@/app/actions";

const initialState: LaunchPackageActionState = { status: "idle", message: "" };

export function LaunchPackagePublish({ packageId, status, publishedUrl }: { packageId: string; status: string; publishedUrl: string | null }) {
  const [state, action, pending] = useActionState(publishLaunchPackageAction, initialState);
  if (publishedUrl) return <a className="mt-5 inline-block text-xs font-medium text-emerald-300 hover:text-emerald-200" href={publishedUrl} rel="noreferrer" target="_blank">View GitHub release ↗</a>;
  if (!["APPROVED", "PUBLISHING", "FAILED"].includes(status)) return null;
  return <form action={action} className="mt-5 rounded-xl border border-rose-400/15 bg-rose-400/[0.04] p-4">
    <input name="packageId" type="hidden" value={packageId} />
    <p className="text-xs font-semibold text-rose-200">External GitHub action</p>
    <p className="mt-1 text-xs leading-5 text-zinc-500">This updates README.md and the repository description, then creates a release with the verified video and evidence. The same approval cannot be submitted twice.</p>
    {state.message && <p className={`mt-2 text-xs ${state.status === "success" ? "text-emerald-300" : "text-rose-300"}`}>{state.message}</p>}
    {state.url && <a className="mt-2 block text-xs text-violet-300" href={state.url} rel="noreferrer" target="_blank">View release ↗</a>}
    <button className="mt-3 rounded-xl bg-rose-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-400 disabled:opacity-50" disabled={pending || status !== "APPROVED"} type="submit">{pending ? "Publishing…" : "Publish approved package to GitHub"}</button>
  </form>;
}
