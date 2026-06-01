// ============================================================================
// id — short unique identifier generation
// ============================================================================
// Pure-ish utility (the only impurity is the entropy source). Ids produced here
// satisfy the schema's `Id` shape: kebab-case, lowercase letters/digits/dashes,
// starting with a letter or digit. Used when the UI authors new elements,
// connections, and annotations that need a stable id the document can store.
// ============================================================================

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A short random suffix (kebab-safe). Uses `crypto.getRandomValues` when
 * available (browser + modern Node), falling back to `Math.random` otherwise.
 */
function randomSuffix(length = 8): string {
  const bytes = new Uint8Array(length);
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (cryptoObj?.getRandomValues !== undefined) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (const byte of bytes) out += ID_ALPHABET[byte % ID_ALPHABET.length] ?? "a";
  return out;
}

/**
 * Build a fresh id of the form `<prefix>-<suffix>`. The prefix is sanitized to
 * the kebab-case alphabet; pass the element/connection type or a noun like
 * "note" so ids stay human-readable (e.g. `service-3f9 ...`, `note-a1b2 ...`).
 */
export function createId(prefix: string): string {
  const safePrefix = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const head = safePrefix === "" ? "id" : safePrefix;
  return `${head}-${randomSuffix()}`;
}

/**
 * Build an id guaranteed not to collide with an existing set. Regenerates on the
 * (astronomically unlikely) clash so callers authoring into a live document
 * never produce a duplicate.
 */
export function createUniqueId(prefix: string, taken: ReadonlySet<string>): string {
  let candidate = createId(prefix);
  while (taken.has(candidate)) candidate = createId(prefix);
  return candidate;
}
