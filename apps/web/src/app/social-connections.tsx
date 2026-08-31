import { disconnectSocialAccountAction } from "@/app/actions";

export type SocialConnection = {
  id: string;
  platform: "X" | "LINKEDIN";
  status: "DISCONNECTED" | "CONNECTED" | "EXPIRED" | "REVOKED";
  displayName: string | null;
  handle: string | null;
  scopes: string[];
  authorizationExpiresAt: Date | null;
};

const platforms = ["X", "LINKEDIN"] as const;

export function SocialConnections({ connections }: { connections: SocialConnection[] }) {
  return (
    <section id="connections" className="mt-6 rounded-3xl border border-white/8 bg-[#111114] p-6">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-400">Social accounts</p>
      <h2 className="mt-2 text-lg font-semibold">Connect your publishing identities</h2>
      <p className="mt-1 text-sm text-zinc-500">Authorization only. Connecting an account never publishes a post.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {platforms.map((platform) => {
          const account = connections.find((connection) => connection.platform === platform);
          const status = account?.status ?? "DISCONNECTED";
          const active = status === "CONNECTED";
          const name = platform === "LINKEDIN" ? "LinkedIn" : "X";
          return <article className="rounded-2xl border border-white/8 bg-black/20 p-5" key={platform}>
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="font-medium">{name}</h3><p className="mt-1 text-xs text-zinc-600">{active ? account?.handle || account?.displayName : status === "EXPIRED" ? "Authorization expired" : "Not connected"}</p></div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${active ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : status === "EXPIRED" ? "border-amber-400/20 bg-amber-400/10 text-amber-200" : "border-white/10 bg-white/5 text-zinc-500"}`}>{status.toLowerCase()}</span>
            </div>
            {active && <div className="mt-4 text-xs text-zinc-500"><p>{account?.displayName}</p><p className="mt-1">Scopes: {account?.scopes.join(", ")}</p>{account?.authorizationExpiresAt && <p className="mt-1">Expires {account.authorizationExpiresAt.toLocaleDateString("en-US")}</p>}</div>}
            <div className="mt-5 flex flex-wrap gap-2">
              <a className="rounded-xl bg-violet-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-violet-400" href={`/api/social/oauth/${platform.toLowerCase()}`}>{active || status === "EXPIRED" ? "Reconnect" : `Connect ${name}`}</a>
              {account && status !== "DISCONNECTED" && <form action={disconnectSocialAccountAction}><input name="platform" type="hidden" value={platform} /><button className="rounded-xl border border-white/10 px-3.5 py-2 text-xs text-zinc-400 transition hover:border-rose-400/30 hover:text-rose-300" type="submit">Disconnect</button></form>}
            </div>
          </article>;
        })}
      </div>
    </section>
  );
}
