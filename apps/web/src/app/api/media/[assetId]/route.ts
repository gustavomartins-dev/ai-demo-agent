import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { parseByteRange, RangeNotSatisfiableError, resolveArtifactPath } from "@/lib/media-delivery";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Not found", { status: 404 });
  const asset = await db.mediaAsset.findFirst({
    where: { id: (await params).assetId, status: "READY", generationRun: { project: { ownerId: session.user.id } } },
    select: { storageKey: true, mimeType: true },
  });
  if (!asset) return new Response("Not found", { status: 404 });

  let filePath: string;
  try {
    filePath = resolveArtifactPath(process.env.AI_DEMO_OUTPUT_ROOT ?? "output", asset.storageKey);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  let size: number;
  try {
    const metadata = await stat(filePath);
    if (!metadata.isFile()) return new Response("Not found", { status: 404 });
    size = metadata.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  let range: { start: number; end: number } | null;
  try {
    range = parseByteRange(request.headers.get("range"), size);
  } catch (error) {
    if (error instanceof RangeNotSatisfiableError) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    throw error;
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const stream = createReadStream(filePath, { start, end });
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Type": asset.mimeType,
    "Content-Length": String(end - start + 1),
    "Content-Disposition": `inline; filename="${path.basename(asset.storageKey).replaceAll('"', "")}"`,
    "X-Content-Type-Options": "nosniff",
  });
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  return new Response(Readable.toWeb(stream) as BodyInit, { status: range ? 206 : 200, headers });
}
