ALTER TABLE "GenerationRun"
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "workerId" TEXT,
ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "GenerationRun_status_nextAttemptAt_idx" ON "GenerationRun"("status", "nextAttemptAt");
CREATE INDEX "GenerationRun_leaseExpiresAt_idx" ON "GenerationRun"("leaseExpiresAt");
