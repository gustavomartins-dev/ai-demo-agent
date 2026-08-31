"use client";

import { useActionState } from "react";
import { approveSocialDraftAction, type ApproveSocialDraftState } from "@/app/actions";

const initialState: ApproveSocialDraftState = { status: "idle", message: "" };

export function SocialDraftApproval({ draftId, approvedAt }: { draftId: string; approvedAt: string | null }) {
  const [state, action, pending] = useActionState(approveSocialDraftAction, initialState);
  return (
    <form action={action} className="mt-4 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4">
      <input name="draftId" type="hidden" value={draftId} />
      <p className="text-xs leading-5 text-emerald-100/70">Approval freezes the currently saved text. It does not publish anything.</p>
      {approvedAt && <p className="mt-2 text-[11px] text-emerald-300">Approved {new Date(approvedAt).toLocaleString("en-US")}</p>}
      {state.message && <p className={`mt-2 text-xs ${state.status === "error" ? "text-rose-300" : "text-emerald-300"}`}>{state.message}</p>}
      <button className="mt-3 rounded-xl bg-emerald-400 px-3.5 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50" disabled={pending} type="submit">{pending ? "Approving…" : approvedAt ? "Approve current version again" : "Approve saved draft"}</button>
    </form>
  );
}
