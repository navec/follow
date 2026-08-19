import path from "node:path";

export interface MigrationStatus {
  name: string;
  path: string;
  state: "applied" | "pending";
}

export function buildMigrationStatuses(
  migrationPaths: string[],
  appliedNames: string[],
): MigrationStatus[] {
  const applied = new Set(appliedNames);

  return migrationPaths
    .map((migrationPath) => {
      const name = path.basename(migrationPath, ".js");
      return {
        name,
        path: migrationPath,
        state: applied.has(name) ? "applied" : "pending",
      } satisfies MigrationStatus;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
