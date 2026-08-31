"use client";

import { useActionState, useState } from "react";
import { saveSocialDraftAction, type SaveSocialDraftState } from "@/app/actions";

const initialState: SaveSocialDraftState = { status: "idle", message: "" };

export function SocialDraftEditor({
  draftId,
  platform,
  initialContent,
}: {
  draftId: string;
  platform: "X" | "LINKEDIN";
  initialContent: string;
}) {
  const [content, setContent] = useState(initialContent);
  const [state, action, pending] = useActionState(saveSocialDraftAction, initialState);
  const limit = platform === "X" ? 280 : 3_000;

  return (
    <form action={action} className="mt-4">
      <input name="draftId" type="hidden" value={draftId} />
      <input name="platform" type="hidden" value={platform} />
      <textarea
        aria-label={`${platform === "LINKEDIN" ? "LinkedIn" : "X"} draft`}
        className="min-h-44 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-zinc-200 outline-none transition focus:border-violet-400/60"
        maxLength={limit}
        name="content"
        onChange={(event) => setContent(event.target.value)}
        required
        value={content}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-xs ${content.length > limit ? "text-rose-300" : "text-zinc-600"}`}>{content.length} / {limit} characters</p>
          {state.message && <p className={`mt-1 text-xs ${state.status === "error" ? "text-rose-300" : "text-emerald-300"}`}>{state.message}</p>}
        </div>
        <button className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50" disabled={pending || !content.trim()} type="submit">
          {pending ? "Saving…" : `Save ${platform === "LINKEDIN" ? "LinkedIn" : "X"} draft`}
        </button>
      </div>
    </form>
  );
}
