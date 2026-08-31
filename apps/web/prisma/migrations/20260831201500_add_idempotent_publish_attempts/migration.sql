CREATE TYPE "PublishAttemptStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN');

CREATE TABLE "PublishAttempt" (
  "id" TEXT NOT NULL,
  "socialDraftId" TEXT NOT NULL,
  "approvalHash" TEXT NOT NULL,
  "status" "PublishAttemptStatus" NOT NULL DEFAULT 'STARTED',
  "providerPostId" TEXT,
  "providerPostUrl" TEXT,
  "errorCode" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublishAttempt_socialDraftId_approvalHash_key" ON "PublishAttempt"("socialDraftId", "approvalHash");
CREATE INDEX "PublishAttempt_status_startedAt_idx" ON "PublishAttempt"("status", "startedAt");
ALTER TABLE "PublishAttempt" ADD CONSTRAINT "PublishAttempt_socialDraftId_fkey"
FOREIGN KEY ("socialDraftId") REFERENCES "SocialDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
