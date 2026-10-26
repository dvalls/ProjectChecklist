import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = ["p", "br", "strong", "em", "ul", "ol", "li", "a"];
const ALLOWED_ATTR = ["href", "rel", "target"];

export type RichTextTag = "p" | "br" | "strong" | "em" | "ul" | "ol" | "li" | "a";

export type RichTextNode =
  | { type: "text"; text: string }
  | { type: "element"; tag: RichTextTag; href?: string; children: RichTextNode[] };

let hooksReady = false;

function ensureHooks() {
  if (hooksReady) return;
  hooksReady = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!("tagName" in node) || node.tagName !== "A") return;
    const href = node.getAttribute("href") ?? "";
    if (!isSafeHref(decodeEntities(href))) {
      node.removeAttribute("href");
      return;
    }
    node.setAttribute("rel", "noopener noreferrer");
    node.setAttribute("target", "_blank");
  });
}

export function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed || /[\u0000-\u001F\s]/.test(trimmed)) return false;
  if (/^mailto:/i.test(trimmed)) {
    const rest = trimmed.slice("mailto:".length);
    return rest.length > 0 && !rest.includes("<") && !rest.includes(">");
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Aceita URL absoluta http(s)/mailto, ou um domínio sem protocolo (vira https). */
export function normalizeHref(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return isSafeHref(trimmed) ? trimmed : null;
  }
  const withProtocol = `https://${trimmed}`;
  return isSafeHref(withProtocol) ? withProtocol : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => safeCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => safeCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gi, "&");
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function normalizeAliases(html: string): string {
  return html
    .replace(/<\s*b(\s|>)/gi, "<strong$1")
    .replace(/<\s*\/\s*b\s*>/gi, "</strong>")
    .replace(/<\s*i(\s|>)/gi, "<em$1")
    .replace(/<\s*\/\s*i\s*>/gi, "</em>");
}

export function plainTextFromHtml(input: string | null | undefined): string {
  if (!input) return "";
  return decodeEntities(
    input
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|ul|ol|tr)>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function fieldPlainLabel(label: string | null | undefined, fallback = ""): string {
  return plainTextFromHtml(label) || fallback;
}

/** HTML curto e seguro para `label` e `help_text`. Vazio vira "". */
export function sanitizeFieldHtml(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  ensureHooks();
  const clean = String(
    DOMPurify.sanitize(normalizeAliases(raw), {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
    }),
  ).trim();
  if (!plainTextFromHtml(clean)) return "";
  return clean;
}

const TAGS = new Set<string>(ALLOWED_TAGS);

function readHref(attrs: string): string | undefined {
  const match = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
  const raw = decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
  return raw && isSafeHref(raw) ? raw : undefined;
}

function parseNodes(html: string): RichTextNode[] {
  const root: RichTextNode[] = [];
  const stack: { tag: RichTextTag; href?: string; children: RichTextNode[] }[] = [];

  const push = (node: RichTextNode) => {
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else root.push(node);
  };

  const close = (tag: string) => {
    let idx = -1;
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i]?.tag === tag) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    while (stack.length - 1 > idx) {
      const open = stack.pop()!;
      stack[stack.length - 1]?.children.push(elementFrom(open));
    }
    const open = stack.pop()!;
    push(elementFrom(open));
  };

  const re = /<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)([^>]*?)\/?>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (match[1]) {
      close(match[1].toLowerCase());
      continue;
    }
    if (match[2]) {
      const tag = match[2].toLowerCase();
      if (!TAGS.has(tag)) continue;
      const selfClosing = tag === "br" || /\/\s*$/.test(match[3] ?? "");
      if (selfClosing) {
        push({ type: "element", tag: "br", children: [] });
        continue;
      }
      stack.push({
        tag: tag as RichTextTag,
        href: tag === "a" ? readHref(match[3] ?? "") : undefined,
        children: [],
      });
      continue;
    }
    const text = decodeEntities(match[4] ?? "");
    if (text) push({ type: "text", text });
  }

  while (stack.length > 0) {
    const open = stack.pop()!;
    const node = elementFrom(open);
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else root.push(node);
  }

  return root;
}

function elementFrom(open: {
  tag: RichTextTag;
  href?: string;
  children: RichTextNode[];
}): RichTextNode {
  return {
    type: "element",
    tag: open.tag,
    href: open.href,
    children: open.children,
  };
}

export function parseRichText(html: string | null | undefined): RichTextNode[] {
  const safe = sanitizeFieldHtml(html);
  if (!safe) {
    const plain = plainTextFromHtml(html);
    return plain ? [{ type: "text", text: plain }] : [];
  }
  const nodes = parseNodes(safe);
  if (nodes.length > 0) return nodes;
  const plain = plainTextFromHtml(safe);
  return plain ? [{ type: "text", text: plain }] : [];
}

export function richTextHasList(nodes: RichTextNode[]): boolean {
  return nodes.some(
    (node) =>
      node.type === "element" &&
      (node.tag === "ul" || node.tag === "ol" || richTextHasList(node.children)),
  );
}
