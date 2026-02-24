/**
 * Convert a string to a URL-safe slug.
 * e.g. "Daily Cookie Copywriters" → "daily-cookie-copywriters"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')   // remove non-word chars (keep letters, digits, spaces, hyphens)
    .trim()
    .replace(/\s+/g, '-')        // spaces → hyphens
    .replace(/-+/g, '-')         // collapse multiple hyphens
    .slice(0, 80);               // max length
}

/** Returns true if the string looks like a UUID (v4). */
export function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
