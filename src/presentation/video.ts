import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { buildEditFilterGraph, type EditSegment } from "./timeline.js";

const execFileAsync = promisify(execFile);
const ffmpegPath = createRequire(import.meta.url)("ffmpeg-static") as string | null;

/**
 * Reads a video's duration with plain ffmpeg (bundled via ffmpeg-static),
 * not GStreamer. Desktop recording already requires GStreamer/Xvfb for
 * capture, but the web (Playwright) path must keep working on a web-only
 * deployment that has neither installed.
 */
export async function ffmpegVideoDurationSeconds(videoPath: string): Promise<number> {
  try {
    // ffmpeg -i with no output prints the input's metadata to stderr and
    // exits non-zero ("At least one output file must be specified") — the
    // standard way to probe a file without a bundled ffprobe binary.
    await execFileAsync(ffmpegPath ?? "ffmpeg", ["-hide_banner", "-i", videoPath], { encoding: "utf8" });
    throw new Error("Expected ffmpeg to reject a probe-only invocation");
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    const duration = stderr.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!duration) throw new Error("Could not determine the recording duration", { cause: error });
    return Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  }
}

/**
 * Executes an edit plan (src/presentation/timeline.ts) as a single ffmpeg
 * trim/setpts/concat filter graph, letterboxed onto a fixed output canvas.
 * Shared by both runners so a captured window's or a custom viewport's
 * native size never leaks into the exported file's aspect ratio.
 */
export async function composeEditedVideo(
  sourcePath: string,
  outputPath: string,
  segments: EditSegment[],
  canvas?: { width: number; height: number },
): Promise<void> {
  await execFileAsync(ffmpegPath ?? "ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", sourcePath,
    "-filter_complex", buildEditFilterGraph(segments, canvas), "-map", "[outv]",
    "-c:v", "libx264", "-preset", "veryfast", "-movflags", "+faststart", outputPath,
  ], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
}
