// Initials for an avatar: first letter of the first two words, uppercased.
// "Ada Lovelace" → "AL", "maya" → "M". Shared by the topbar chip and the
// presence avatars (#66) so a user reads the same everywhere.
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.slice(0, 2).map((w) => w[0] ?? "");
  return letters.join("").toUpperCase();
}
