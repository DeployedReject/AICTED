import type { Env } from "./shared";
import { fail } from "./shared";
const bytesTo64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const from64 = (text: string) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
async function key(env: Env) {
  if (!env.CONFIG_KEY || !/^[a-f0-9]{64}$/i.test(env.CONFIG_KEY))
    fail(503, "Encrypted settings are not configured.");
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(env.CONFIG_KEY.match(/../g)!, (h) => parseInt(h, 16)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(env: Env, value: string, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
    await key(env),
    new TextEncoder().encode(value),
  );
  return bytesTo64(iv) + "." + bytesTo64(new Uint8Array(encrypted));
}
export async function unseal(env: Env, value: string, context: string) {
  const [iv, data] = value.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: from64(iv),
        additionalData: new TextEncoder().encode(context),
      },
      await key(env),
      from64(data),
    ),
  );
}
export async function getSecret(env: Env, demo: number, name: string) {
  const row = await (env.CONTROL_DB || env.DB)
    .prepare("SELECT ciphertext FROM secret_store WHERE is_demo=? AND name=?")
    .bind(demo, name)
    .first<{ ciphertext: string }>();
  return row ? unseal(env, row.ciphertext, `${demo}:${name}`) : null;
}
