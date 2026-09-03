# Desktop application demos

## Product outcome

AI Demo Agent accepts explicit `Web app` and `Desktop app` projects. A desktop project keeps its public product/repository URL for the English launch story and adds a local project path plus a launch command for the worker that owns the graphical session.

## Trust boundary

A launch command is executable code, not ordinary product metadata. The worker must never pass it to a shell. Desktop execution must:

- resolve the local project path inside an operator-configured root allowlist;
- reject shell operators, substitutions, redirects, and multiline commands;
- resolve the executable inside that project directory;
- invoke the executable with an argument array and the project as its working directory;
- bind Hermes Computer Use to the launched process/window;
- terminate only the process started for that generation run;
- persist failure evidence and finalize recording during cleanup;
- reject a recording that decodes to black or visually empty frames;
- verify every step's evidence itself instead of trusting the model's self-report.

The web server stores the configuration but does not launch native applications. Only the separately operated generation worker receives graphical-session access.

## Current form contract

Desktop projects require:

- `Public product URL` — the stable URL used in review and social posts;
- `Repository URL` — optional unless the project is marked open source;
- `Local project path` — an absolute worker-local checkout path;
- `Launch command` — a project-contained executable and optional arguments;
- `Launch objective` — the user-visible workflow Hermes must demonstrate.

The Water Reminder acceptance target uses `/home/gustavo-fonseca-martins/lembrete-agua` and its project-local virtual-environment executable. Secrets and environment-variable assignments do not belong in the launch command.

## Worker environment

```dotenv
AI_DEMO_DESKTOP_PROJECT_ROOTS="/srv/ai-demo-projects"
AI_DEMO_FFMPEG_PATH="/usr/bin/ffmpeg"
AI_DEMO_DESKTOP_GDK_BACKEND="x11"
AI_DEMO_DESKTOP_GSK_RENDERER="cairo"
AI_DEMO_XVFB_PATH="Xvfb"
AI_DEMO_X11_WINDOW_MANAGER_PATH="openbox"
AI_DEMO_XVFB_SCREEN_SIZE="1600x1000x24"
```

`AI_DEMO_DESKTOP_PROJECT_ROOTS` uses the operating-system path delimiter when multiple roots are required. `AI_DEMO_FFMPEG_PATH` remains available to Hermes/cua-driver. On Linux, the host runner records the exact X11 window region as H.264 MP4 with GStreamer (`ximagesrc`, `videoconvert`, `x264enc`, and `mp4mux`) so recording does not depend on model-exposed tools.

`AI_DEMO_DESKTOP_GSK_RENDERER=cairo` keeps GTK4 pixels readable by `ximagesrc`.
GTK4's GPU renderer can leave the X11 backing pixmap black while the compositor
still displays the window, which produced a passing report over an unusable black
video. The run now decodes the first frames of its own recording and fails unless
at least one frame carries visible interface content.

On Linux, the runner starts an isolated `Xvfb` display with Openbox, shared by the
application, Hermes Computer Use, and GStreamer. This makes recording independent
from the host Wayland session and gives CUA a verifiable focused window for safe
input delivery. `AI_DEMO_XVFB_PATH` and `AI_DEMO_X11_WINDOW_MANAGER_PATH` can point
to local executables when the packages are not installed system-wide. A portable
Openbox bundle can instead be selected with `AI_DEMO_OPENBOX_ROOT`.

`AI_DEMO_DESKTOP_GDK_BACKEND=x11` makes GTK applications visible to the bounded Linux Computer Use path. The worker requires `Xvfb`, `xprop`, `xwininfo`, `gst-launch-1.0`, and the listed GStreamer plugins. A web-only/headless deployment should leave desktop execution disabled by omitting the root allowlist.

`AI_DEMO_XVFB_SCREEN_SIZE` defaults to `1600x1000x24`, larger than the default
1280x720 output canvas. A virtual screen that only matched the output size
clipped any application window taller or wider than that — the recorder
captured exactly the window's geometry, and the window manager could not lay
out more than the screen allowed.

Window discovery waits up to 20 seconds and polls the launched process's
liveness on every attempt; if the process exits first (a crash on launch, a
missing dependency in the target's virtual environment) the run fails
immediately with that cause instead of waiting out the full timeout.

## Evidence and pacing

Hermes runs one Computer Use call per demo step instead of one call for the
whole demo. That trade — more subprocess round trips for a shorter, more
reliable unit of work per call — buys two things a single batched call could
not:

- **host-verified evidence.** After each step, the host itself captures a
  screenshot of the bound window (independent of anything Hermes reports) and
  rejects the step unless that screenshot decodes to visible content — the
  same black-frame check the whole recording is held to. A step is only
  marked passed if Hermes says it succeeded *and* the host's own screenshot
  backs that up; a plausible-sounding self-report with no visible change
  behind it fails the step instead of quietly reaching the report.
- **a real timeline.** The host now knows exactly when each step's call
  started and finished relative to the raw recording. That per-step timing
  (`src/desktop/timeline.ts`) drives a segment-by-segment edit instead of one
  global playback-rate multiplier over the whole clip: dead time between
  steps is trimmed to a short tail (a static frame sped up still looks
  static, so cutting it loses nothing), a step that changes the screen
  (click/fill/press) keeps a real display window since the change can land
  anywhere inside it, and a step that only confirms something already
  visible (assertVisible/wait) gets a shorter one. Total output length now
  follows from how many steps the plan has rather than being squeezed to a
  fixed target duration, with one uniform correction pass only if a
  many-step plan still runs past a ~75s ceiling.

Captions follow the same per-step timing, one cue per passed step placed at
that step's real position in the edited output — not a linear slice of the
narration summary across the whole runtime. Each cue uses the step's `title`
from the Hermes plan (both planning prompts now require one) or a generated
fallback like "Clicking Save" when a step has none. The spoken narration
track is a separate, whole-demo portfolio summary; captions describe what is
happening on screen, narration explains why the product exists.

The output canvas is a fixed 1280x720 regardless of the captured window's
native size (scaled to fit, letterboxed rather than cropped), so a window
larger or smaller than that doesn't produce an odd aspect ratio in the
exported file.

## Water Reminder acceptance result

The current native acceptance run produced a passed execution report, a visually
validated MP4, and English X and LinkedIn drafts in `READY_FOR_REVIEW`.
The verified journey opens the GTK4 application, navigates from Plano to Dashboard,
shows recent history and 7/30-day metrics, returns to Plano, and expands the optional
calculation panel. Openbox supplies verifiable focus inside Xvfb, so CUA can deliver
bounded input without touching the user's physical desktop.

The social drafts use a first-person engineering portfolio voice: what was built,
why the practical problem mattered, and which implementation decisions shaped the
result. Sales language and unsupported claims fail evaluation. Publishing remains
approval-only.
