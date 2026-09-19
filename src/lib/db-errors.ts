// Postgres / PostgREST errors that mean "migration_008_polish.sql has not been applied yet".
// Routes use this to answer with a clear Uzbek message instead of a raw database error.
export const MIGRATION_HINT =
  "Maʼlumotlar bazasi yangilanmagan. Supabase → SQL Editorʼda supabase/migration_008_polish.sql faylini ishga tushiring.";

interface DbErrorLike {
  code?: string | null;
  message?: string | null;
}

export function isMissingSchema(err: DbErrorLike | null | undefined): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  if (["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(code)) return true;
  return /does not exist|schema cache|could not find/i.test(err.message ?? "");
}
