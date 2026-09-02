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
- reject a recording that decodes to black or visually empty frames.

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

## Water Reminder acceptance result

The current native acceptance run produced a passed execution report, a visually
validated 91-second MP4, and English X and LinkedIn drafts in `READY_FOR_REVIEW`.
The verified journey opens the GTK4 application, navigates from Plano to Dashboard,
shows recent history and 7/30-day metrics, returns to Plano, and expands the optional
calculation panel. Openbox supplies verifiable focus inside Xvfb, so CUA can deliver
bounded input without touching the user's physical desktop.

The social drafts use a first-person engineering portfolio voice: what was built,
why the practical problem mattered, and which implementation decisions shaped the
result. Sales language and unsupported claims fail evaluation. Publishing remains
approval-only.
