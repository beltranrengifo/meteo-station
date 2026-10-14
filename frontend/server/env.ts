// Server env vars (Vercel). Never VITE_*: those end up in the browser bundle.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing env var ${name}`);
  }
  return value;
}
