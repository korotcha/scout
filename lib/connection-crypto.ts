// The encryption key lives only in the hosted secret store, never in D1 or source.
const encoder = new TextEncoder();
function bytes(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
function base64(value: Uint8Array) { return btoa(String.fromCharCode(...value)); }
async function key(secret: string) {
  const raw = bytes(secret); if(raw.length!==32) throw new Error("Хранилище ключей не настроено");
  return crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);
}
export async function encryptKey(token: string, secret: string, context = "market-radar:wb:v1") {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:encoder.encode(context)},await key(secret),encoder.encode(token));
  return base64(iv)+"."+base64(new Uint8Array(encrypted));
}
export async function decryptKey(value: string, secret: string, context = "market-radar:wb:v1") {
  const [iv,encrypted]=value.split(".");
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(iv),additionalData:encoder.encode(context)},await key(secret),bytes(encrypted));
  return new TextDecoder().decode(plain);
}
