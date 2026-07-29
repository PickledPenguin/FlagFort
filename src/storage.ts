export function browserStorage(): Storage | null {
  try {
    return typeof document === "undefined" ? null : document.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}
