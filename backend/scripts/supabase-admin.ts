// Shared by the pnpm firmware and pnpm station scripts: the Supabase client with the secret
// key, read from backend/.env.local (git-ignored; see docs/nueva-estacion.md, step 5).
import { createClient } from "npm:@supabase/supabase-js@2";

export function fail(message: string): never {
  console.error(message);
  Deno.exit(1);
}

export function connect() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SECRET_KEY");
  if (!url || !key) {
    fail("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in backend/.env.local (docs/nueva-estacion.md, step 5)");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
