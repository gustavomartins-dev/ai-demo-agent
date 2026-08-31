import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../apps/web/src/lib/db.js";
import { socialContentHash } from "../apps/web/src/lib/social-approval.js";

const outputRoot = path.resolve(process.env.AI_DEMO_OUTPUT_ROOT ?? "/tmp/ai-demo-agent-e2e-output");
const runDirectory = path.join(outputRoot, "e2e-run");

try {
  await mkdir(path.join(runDirectory, "evidence"), { recursive: true });
  await writeFile(path.join(runDirectory, "demo.webm"), Buffer.alloc(1024, 7));
  await writeFile(path.join(runDirectory, "execution-report.json"), JSON.stringify({ status: "passed" }));
  await writeFile(path.join(runDirectory, "evidence", "step-2.png"), Buffer.alloc(128, 3));

  await db.user.deleteMany({ where: { id: "e2e-owner" } });
  await db.user.create({
    data: {
      id: "e2e-owner",
      name: "E2E Owner",
      email: "e2e@example.com",
      sessions: { create: { sessionToken: "e2e-session-token", expires: new Date(Date.now() + 60 * 60_000) } },
      socialAccounts: {
        create: [{
          id: "e2e-x-account",
          platform: "X",
          status: "CONNECTED",
          externalAccountId: "x-e2e-owner",
          displayName: "E2E Owner",
          handle: "@e2e_owner",
          scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
          authorizationExpiresAt: new Date(Date.now() + 60 * 60_000),
          connectedAt: new Date(),
          credential: { create: { encryptedAccessToken: "e2e-not-used", encryptionKeyId: "e2e-v1" } },
        }],
      },
      projects: {
        create: {
          id: "e2e-project",
          name: "Evidence-grounded launch",
          productUrl: "https://product.example",
          repositoryUrl: "https://github.com/example/product",
          isOpenSource: true,
          status: "REVIEW",
          runs: {
            create: {
              id: "e2e-run",
              objective: "Review the generated launch before publishing.",
              status: "READY_FOR_REVIEW",
              attemptCount: 2,
              startedAt: new Date(),
              completedAt: new Date(),
              assets: {
                create: [
                  { id: "e2e-video", type: "VIDEO", status: "READY", storageKey: "e2e-run/demo.webm", mimeType: "video/webm", sizeBytes: 1024 },
                  { id: "e2e-report", type: "EXECUTION_REPORT", status: "READY", storageKey: "e2e-run/execution-report.json", mimeType: "application/json" },
                  { id: "e2e-evidence", type: "EVIDENCE", status: "READY", storageKey: "e2e-run/evidence/step-2.png", mimeType: "image/png", sizeBytes: 128 },
                ],
              },
              socialDrafts: {
                create: [
                  {
                    id: "e2e-x-draft",
                    platform: "X",
                    status: "DRAFT",
                    content: "A verified product review. https://github.com/example/product",
                    repositoryUrl: "https://github.com/example/product",
                    claimIds: ["claim-2"],
                    evidence: [{ id: "claim-2", statement: "Visible heading: Review", evidenceStorageKey: "e2e-run/evidence/step-2.png" }],
                    mentions: [],
                  },
                  {
                    id: "e2e-linkedin-draft",
                    platform: "LINKEDIN",
                    status: "PUBLISHED",
                    content: "A verified professional launch. https://github.com/example/product",
                    approvedContent: "A verified professional launch. https://github.com/example/product",
                    approvedContentHash: socialContentHash("LINKEDIN", "A verified professional launch. https://github.com/example/product"),
                    approvedByUserId: "e2e-owner",
                    approvedAt: new Date(),
                    publishedAt: new Date(),
                    publishedPostId: "urn:li:share:e2e",
                    publishedPostUrl: "https://www.linkedin.com/feed/update/urn:li:share:e2e",
                    claimIds: ["claim-2"],
                    evidence: [{ id: "claim-2", statement: "Visible heading: Review", evidenceStorageKey: "e2e-run/evidence/step-2.png" }],
                    mentions: [],
                  },
                ],
              },
            },
          },
        },
      },
    },
  });
  console.log("E2E launch fixture is ready.");
} finally {
  await db.$disconnect();
}
