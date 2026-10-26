import { plainTextFromHtml, sanitizeFieldHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

const RICH_CLASS =
  "min-w-0 break-words [&_a]:underline [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5";

export function RichText({
  html,
  className,
}: {
  html: string | null | undefined;
  className?: string;
}) {
  const safe = sanitizeFieldHtml(html);
  if (!safe) return null;
  return (
    <div
      className={cn(RICH_CLASS, className)}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

export function RichTextOr({
  html,
  fallback = null,
  className,
}: {
  html: string | null | undefined;
  fallback?: string | null;
  className?: string;
}) {
  if (!plainTextFromHtml(html)) {
    if (!fallback) return null;
    return <span className={className}>{fallback}</span>;
  }
  return <RichText html={html} className={className} />;
}

export function FieldHelpText({
  html,
  className,
}: {
  html: string | null | undefined;
  className?: string;
}) {
  if (!plainTextFromHtml(html)) return null;
  return (
    <RichText
      html={html}
      className={cn("text-xs italic text-muted-foreground", className)}
    />
  );
}
