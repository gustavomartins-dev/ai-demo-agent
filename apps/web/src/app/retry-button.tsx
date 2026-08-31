"use client";

import { useFormStatus } from "react-dom";

export function RetryButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/15 disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Queueing retry..." : "Retry generation"}
    </button>
  );
}
