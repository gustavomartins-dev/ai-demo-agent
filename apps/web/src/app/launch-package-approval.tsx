"use client";

import { useActionState } from "react";
import { approveLaunchPackageAction, type LaunchPackageActionState } from "@/app/actions";

const initialState: LaunchPackageActionState = { status: "idle", message: "" };

export function LaunchPackageApproval({ packageId, approvedAt, disabled }: { packageId: string; approvedAt: string | null; disabled: boolean }) {
  const [state, action, pending] = useActionState(approveLaunchPackageAction, initialState);
  return <form action={action} className="mt-5 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4">
    <input name="packageId" type="hidden" value={packageId} />
    <p className="text-xs leading-5 text-emerald-100/70">Approval freezes the exact README, description, release tag, and release notes. It does not change GitHub.</p>
    {approvedAt && <p className="mt-2 text-[11px] text-emerald-300">Approved {new Date(approvedAt).toLocaleString("en-US")}</p>}
    {state.message && <p className={`mt-2 text-xs ${state.status === "error" ? "text-rose-300" : "text-emerald-300"}`}>{state.message}</p>}
    <button className="mt-3 rounded-xl bg-emerald-400 px-3.5 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-300 disabled:opacity-50" disabled={pending || disabled} type="submit">{pending ? "Approving…" : approvedAt ? "Approve current version again" : "Approve launch package"}</button>
  </form>;
}
