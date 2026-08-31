import { signOut } from "@/auth";

export function AccountMenu({ name, email }: { name?: string | null; email?: string | null }) {
  const label = name || email || "Workspace owner";
  const initial = label.slice(0, 1).toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="max-w-44 truncate text-xs font-medium text-zinc-300">{label}</p>
        {name && email && <p className="max-w-44 truncate text-[10px] text-zinc-600">{email}</p>}
      </div>
      <div className="grid size-9 place-items-center rounded-full border border-violet-400/20 bg-violet-400/10 text-xs font-semibold text-violet-300">{initial}</div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button className="rounded-lg px-2.5 py-2 text-xs text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200" type="submit">Sign out</button>
      </form>
    </div>
  );
}
