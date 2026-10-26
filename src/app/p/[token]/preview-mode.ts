export const PREVIEW_IDENTITY = {
  client_name: "Visualização",
  client_email: "preview@local",
} as const;

export function isPreviewMode(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.includes("1");
  return value === "1";
}

export function withPreview(path: string, preview: boolean): string {
  if (!preview) return path;
  return path.includes("?") ? `${path}&preview=1` : `${path}?preview=1`;
}
