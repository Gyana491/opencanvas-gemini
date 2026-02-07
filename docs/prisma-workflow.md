# Prisma Workflow: How to Update Your Database Schema

Follow these steps whenever you need to modify your database schema (e.g., adding a new column, creating a table).

## 1. Modify the Schema
Open `prisma/schema.prisma` and make your changes.

Example: Adding a field to `User`
```prisma
model User {
  // ... existing fields
  phoneNumber String?  // New field
}
```

## 2. Generate Migration & Apply Locally
Run the following command to create a migration file and apply it to your local database:

```bash
npx prisma migrate dev --name describe_your_change
```
*Replace `describe_your_change` with a short name like `add_phone_number`.*

**What this does:**
- Creates a SQL file in `prisma/migrations`.
- Updates your local database.
- Regenerates the Prisma Client (so TypeScript knows about the new field).

## 3. Verify (Optional but Recommended)
Open Prisma Studio to inspect your local database and ensure the changes look correct:

```bash
npx prisma studio
```

## 4. Commit to Git
Commit both the modified `schema.prisma` AND the new migration folder.

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add phoneNumber to User schema"
```

## 5. Deploying to Production
When your code is deployed (e.g., Vercel, Railway, etc.), the build command should automatically run:

```bash
npx prisma migrate deploy
```
*Note: Vercel projects usually have this configured in the build settings or `package.json` scripts.*

---

## Troubleshooting

### "My local DB is out of sync!"
If you get errors saying the database is drift or out of sync, you can reset it (WARNING: THIS DELETES ALL LOCAL DATA):

```bash
npx prisma migrate reset
```

### "TypeScript doesn't see my new field!"
If VS Code doesn't autocomplete your new field, run:

```bash
npx prisma generate
```
