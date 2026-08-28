"use client";

import { useActionState } from "react";
import { createProjectAction, type CreateProjectState } from "./actions";

const initialState: CreateProjectState = { status: "idle", message: "" };

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="mt-1.5 text-xs text-rose-400">{errors[0]}</p>;
}

export function ProjectForm({ databaseConfigured }: { databaseConfigured: boolean }) {
  const [state, formAction, pending] = useActionState(createProjectAction, initialState);
  const inputClass = "mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/10";

  return (
    <form action={formAction} className="grid gap-5 md:grid-cols-2">
      <label className="text-sm text-zinc-300">
        Project name
        <input className={inputClass} name="name" placeholder="My new product" required minLength={2} maxLength={80} />
        <FieldError errors={state.errors?.name} />
      </label>
      <label className="text-sm text-zinc-300">
        Product URL
        <input className={inputClass} name="productUrl" type="url" placeholder="https://product.example" required />
        <FieldError errors={state.errors?.productUrl} />
      </label>
      <label className="text-sm text-zinc-300 md:col-span-2">
        Repository URL <span className="text-zinc-600">(optional)</span>
        <input className={inputClass} name="repositoryUrl" type="url" placeholder="https://github.com/you/project" />
        <FieldError errors={state.errors?.repositoryUrl} />
      </label>
      <label className="text-sm text-zinc-300 md:col-span-2">
        Launch objective
        <textarea className={`${inputClass} min-h-24 resize-y`} name="objective" placeholder="Show how the product solves its main user problem." required minLength={10} maxLength={500} />
        <FieldError errors={state.errors?.objective} />
      </label>
      <label className="flex items-center gap-3 text-sm text-zinc-400">
        <input className="size-4 accent-violet-500" name="isOpenSource" type="checkbox" />
        Include the repository in social posts
      </label>
      <div className="flex items-center justify-end gap-4">
        {state.message && <p aria-live="polite" className={`text-xs ${state.status === "success" ? "text-emerald-400" : "text-rose-400"}`}>{state.message}</p>}
        <button disabled={!databaseConfigured || pending} className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400">
          {pending ? "Creating..." : "Create project"}
        </button>
      </div>
    </form>
  );
}
