"use client";

import { useState } from "react";

const stages = [
  {
    label: "Plan",
    eyebrow: "01 · Understand",
    title: "Hermes turns intent into a bounded demo plan.",
    body: "The planner reads repository context, keeps claims tied to documented behavior, and returns a structured journey that must pass schema validation.",
    signal: "Plan validated",
    detail: "14 safe steps",
  },
  {
    label: "Record",
    eyebrow: "02 · Operate",
    title: "Playwright or native Computer Use performs the journey.",
    body: "The runner interacts with the real application while video, timestamps, screenshots, and step outcomes are captured together.",
    signal: "Recording active",
    detail: "1280 × 720",
  },
  {
    label: "Verify",
    eyebrow: "03 · Prove",
    title: "Visible evidence decides what the story may claim.",
    body: "Every important result is checked on screen. Failed or unsupported steps stay visible in the report instead of being rewritten as success.",
    signal: "Evidence linked",
    detail: "14 / 14 passed",
  },
  {
    label: "Review",
    eyebrow: "04 · Approve",
    title: "The owner reviews every draft before publication.",
    body: "DemoAgent prepares separate posts for X and LinkedIn, but official APIs remain locked until the final content is explicitly approved.",
    signal: "Awaiting owner",
    detail: "0 auto-published",
  },
] as const;

export function ShowcaseExperience() {
  const [active, setActive] = useState(0);
  const stage = stages[active];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#08080b] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_5%,rgba(124,58,237,0.25),transparent_30%),radial-gradient(circle_at_88%_16%,rgba(6,182,212,0.16),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.045] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:54px_54px]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1440px] flex-col px-8 py-7 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/8 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-[0_0_35px_rgba(124,58,237,.35)]">
              <svg aria-hidden="true" className="size-6 text-white" fill="none" viewBox="0 0 24 24">
                <path d="M4 12h5m6 0h5M9 12c3.5 0 3.5-6 7-6m-7 6c3.5 0 3.5 6 7 6" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                <circle cx="4" cy="12" fill="currentColor" r="2" /><circle cx="20" cy="6" fill="currentColor" r="2" /><circle cx="20" cy="12" fill="currentColor" r="2" /><circle cx="20" cy="18" fill="currentColor" r="2" />
              </svg>
            </div>
            <div><p className="font-semibold tracking-tight">DemoAgent</p><p className="text-xs text-zinc-500">Evidence-first project launches</p></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.07] px-3 py-1.5 text-xs text-amber-100/80">First test version · improving continuously</span>
            <a className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-medium text-zinc-200" href="#pipeline">Explore the pipeline</a>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[0.88fr_1.12fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">Built to show the work</p>
            <h1 className="mt-5 max-w-xl text-5xl font-semibold leading-[1.04] tracking-[-0.045em] text-white">Turn working software into verified proof.</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-400">I built DemoAgent to plan, record, validate, and package real project demonstrations—then keep every external publication behind human approval.</p>

            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
              {[
                ["Structured", "Plans"],
                ["Visual", "Evidence"],
                ["Explicit", "Approval"],
              ].map(([value, label]) => <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4" key={label}><p className="text-lg font-semibold text-white">{value}</p><p className="mt-1 text-xs text-zinc-500">{label}</p></div>)}
            </div>

            <div className="mt-7 flex items-center gap-3 text-xs text-zinc-500">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-emerald-400" /></span>
              This showcase is being recorded by DemoAgent itself.
            </div>
          </div>

          <section id="pipeline" className="rounded-[28px] border border-white/10 bg-[#101014]/95 p-5 shadow-2xl shadow-black/45">
            <div className="flex items-start justify-between gap-6 px-1 pb-5">
              <div><p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Live pipeline walkthrough</p><h2 className="mt-2 text-xl font-semibold">One project, from intent to review</h2></div>
              <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.07] px-3 py-2 text-right"><p className="text-[10px] uppercase tracking-wider text-emerald-300/70">Run status</p><p className="mt-0.5 text-xs font-medium text-emerald-200">Ready for review</p></div>
            </div>

            <div className="grid grid-cols-4 gap-2 rounded-2xl bg-black/25 p-1.5" role="tablist" aria-label="Demo pipeline stages">
              {stages.map((item, index) => <button aria-controls="showcase-stage" aria-selected={active === index} className={`rounded-xl px-3 py-2.5 text-xs font-medium transition ${active === index ? "bg-white text-zinc-950 shadow-lg" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"}`} key={item.label} onClick={() => setActive(index)} role="tab">{item.label}</button>)}
            </div>

            <div className="mt-4 grid min-h-[285px] gap-4 sm:grid-cols-[1.15fr_.85fr]" id="showcase-stage" role="tabpanel">
              <article className="flex flex-col rounded-2xl border border-white/8 bg-white/[0.025] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">{stage.eyebrow}</p>
                <h3 className="mt-4 text-2xl font-semibold leading-8 tracking-tight">{stage.title}</h3>
                <p className="mt-4 text-sm leading-6 text-zinc-500">{stage.body}</p>
                <div className="mt-auto flex items-center justify-between border-t border-white/8 pt-4 text-xs"><span className="flex items-center gap-2 text-emerald-300"><span className="size-1.5 rounded-full bg-emerald-400" />{stage.signal}</span><span className="font-mono text-zinc-600">{stage.detail}</span></div>
              </article>

              <div className="space-y-3">
                <article className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="flex items-center justify-between"><p className="text-xs font-medium">Evidence bundle</p><span className="text-[10px] text-emerald-300">verified</span></div>
                  <div className="mt-4 aspect-video rounded-xl border border-white/8 bg-[linear-gradient(135deg,rgba(124,58,237,.22),rgba(6,182,212,.08))] p-3">
                    <div className="h-full rounded-lg border border-white/10 bg-black/35 p-3"><div className="h-2 w-20 rounded-full bg-white/15" /><div className="mt-3 h-2 w-full rounded-full bg-violet-400/25" /><div className="mt-2 h-2 w-4/5 rounded-full bg-white/10" /><div className="mt-5 flex gap-2"><div className="h-8 flex-1 rounded-md bg-white/8" /><div className="h-8 flex-1 rounded-md bg-cyan-400/10" /></div></div>
                  </div>
                  <p className="mt-3 font-mono text-[10px] text-zinc-600">video · screenshots · execution report</p>
                </article>
                <article className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.045] p-4"><p className="text-xs font-medium text-amber-100">Human approval gate</p><p className="mt-2 text-xs leading-5 text-zinc-500">X, LinkedIn, and GitHub actions remain locked until review.</p></article>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
