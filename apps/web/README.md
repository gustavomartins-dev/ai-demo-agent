# AI Demo Agent Web

The personal workspace for turning a project into a verified demo and approved
social launch.

## Local development

From the repository root:

```bash
npm install
npm run dev:web
```

Open `http://localhost:3000`.

## Database

```bash
cp apps/web/.env.example apps/web/.env
docker compose up -d postgres
npm run db:migrate
```

The committed Prisma migrations are the source of truth for PostgreSQL.

## Quality checks

```bash
npm run lint:web
npm run check:web
npm run build:web
```

The interface and generated social content are English-only. Publication to X
or LinkedIn will always require explicit approval.
