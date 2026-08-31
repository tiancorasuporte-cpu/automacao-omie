export function matchesQuery(query: string, parts: Array<string | number | null | undefined>) {
  const needle = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!needle) return true;
  const haystack = parts
    .filter((part) => part != null && String(part).trim() !== "")
    .map((part) => String(part).toLowerCase())
    .join(" ");
  if (needle.split(" ").every((word) => haystack.includes(word))) return true;
  const digitsNeedle = needle.replace(/\D/g, "");
  const digitsHay = haystack.replace(/\D/g, "");
  return digitsNeedle.length >= 3 && digitsHay.includes(digitsNeedle);
}
