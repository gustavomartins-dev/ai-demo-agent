ALTER TABLE "SocialDraft"
ADD COLUMN "approvedContent" TEXT,
ADD COLUMN "approvedContentHash" TEXT,
ADD COLUMN "approvedByUserId" TEXT;

CREATE INDEX "SocialDraft_approvedByUserId_idx" ON "SocialDraft"("approvedByUserId");
ALTER TABLE "SocialDraft" ADD CONSTRAINT "SocialDraft_approvedByUserId_fkey"
FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
