-- AlterTable
ALTER TABLE "GenerationRun" ADD COLUMN "repositorySnapshot" JSONB;

-- AlterTable
ALTER TABLE "SocialDraft" ADD COLUMN "sourcePaths" JSONB;

-- CreateTable
CREATE TABLE "LaunchPackage" (
    "id" TEXT NOT NULL,
    "generationRunId" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "repositoryOwner" TEXT NOT NULL,
    "repositoryName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL,
    "sourceSha" TEXT NOT NULL,
    "repositoryDescription" TEXT NOT NULL,
    "readmeMarkdown" TEXT NOT NULL,
    "releaseTag" TEXT NOT NULL,
    "releaseTitle" TEXT NOT NULL,
    "releaseNotesMarkdown" TEXT NOT NULL,
    "sourcePaths" JSONB NOT NULL,
    "claimIds" JSONB NOT NULL,
    "approvedSnapshot" JSONB,
    "approvedContentHash" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "publishedCommitSha" TEXT,
    "publishedReleaseId" TEXT,
    "publishedReleaseUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaunchPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubPublishAttempt" (
    "id" TEXT NOT NULL,
    "launchPackageId" TEXT NOT NULL,
    "approvalHash" TEXT NOT NULL,
    "status" "PublishAttemptStatus" NOT NULL DEFAULT 'STARTED',
    "commitSha" TEXT,
    "releaseId" TEXT,
    "releaseUrl" TEXT,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubPublishAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LaunchPackage_generationRunId_key" ON "LaunchPackage"("generationRunId");
CREATE INDEX "LaunchPackage_status_idx" ON "LaunchPackage"("status");
CREATE INDEX "LaunchPackage_approvedByUserId_idx" ON "LaunchPackage"("approvedByUserId");
CREATE UNIQUE INDEX "GitHubPublishAttempt_launchPackageId_approvalHash_key" ON "GitHubPublishAttempt"("launchPackageId", "approvalHash");
CREATE INDEX "GitHubPublishAttempt_status_startedAt_idx" ON "GitHubPublishAttempt"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "LaunchPackage" ADD CONSTRAINT "LaunchPackage_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaunchPackage" ADD CONSTRAINT "LaunchPackage_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GitHubPublishAttempt" ADD CONSTRAINT "GitHubPublishAttempt_launchPackageId_fkey" FOREIGN KEY ("launchPackageId") REFERENCES "LaunchPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
