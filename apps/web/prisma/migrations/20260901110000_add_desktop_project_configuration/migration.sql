CREATE TYPE "ProjectKind" AS ENUM ('WEB', 'DESKTOP');

ALTER TABLE "Project"
ADD COLUMN "kind" "ProjectKind" NOT NULL DEFAULT 'WEB',
ADD COLUMN "localPath" TEXT,
ADD COLUMN "launchCommand" TEXT;
