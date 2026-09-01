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
- persist failure evidence and finalize recording during cleanup.

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
```

`AI_DEMO_DESKTOP_PROJECT_ROOTS` uses the operating-system path delimiter when multiple roots are required. `AI_DEMO_FFMPEG_PATH` points to the worker-controlled ffmpeg binary used by cua-driver for MP4 screen recording on Linux and Windows. The worker must run inside the same interactive graphical session as the application; a web-only/headless deployment should leave desktop execution disabled by omitting the root allowlist.
