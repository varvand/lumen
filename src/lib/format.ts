export function dateLabel(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A stable hue for a tag, so the same tag always gets the same color. */
export function tagHue(tag: string) {
  let hash = 2166136261;
  for (const char of tag.toLowerCase()) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return ((hash >>> 0) % 12) * 30;
}
