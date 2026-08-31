"use client";

import { useActionState } from "react";
import { publishSocialDraftAction, type PublishSocialDraftState } from "@/app/actions";

const initialState: PublishSocialDraftState = { status: "idle", message: "" };

export function SocialDraftPublish({ draftId, status, publishedUrl }: { draftId: string; status: string; publishedUrl: string | null }) {
  const [state, action, pending] = useActionState(publishSocialDraftAction, initialState);
  if (publishedUrl) return <a className="mt-4 inline-block text-xs font-medium text-emerald-300 hover:text-emerald-200" href={publishedUrl} rel="noreferrer" target="_blank">View published post ↗</a>;
  if (status !== "APPROVED" && status !== "PUBLISHING" && status !== "FAILED") return null;
  return <form action={action} className="mt-4 rounded-xl border border-rose-400/15 bg-rose-400/[0.04] p-4">
    <input name="draftId" type="hidden" value={draftId} />
    <p className="text-xs font-semibold text-rose-200">External action</p>
    <p className="mt-1 text-xs leading-5 text-zinc-500">This sends the exact approved snapshot to the connected account. Double clicks and retries cannot create another attempt for the same approval.</p>
    {state.message && <p className={`mt-2 text-xs ${state.status === "success" ? "text-emerald-300" : "text-rose-300"}`}>{state.message}</p>}
    {state.url && <a className="mt-2 block text-xs text-violet-300" href={state.url} rel="noreferrer" target="_blank">View post ↗</a>}
    <button className="mt-3 rounded-xl bg-rose-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-rose-400 disabled:opacity-50" disabled={pending || status !== "APPROVED"} type="submit">{pending ? "Publishing…" : "Publish approved post"}</button>
  </form>;
}
