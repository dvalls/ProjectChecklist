import { type ReactNode } from "react";
import { Link, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

import { parseRichText, richTextHasList, type RichTextNode } from "@/lib/rich-text";

type PdfStyle = Style | Style[] | undefined;

function pickFontFamily(style: PdfStyle): string {
  const items = Array.isArray(style) ? style : [style];
  let font = "Helvetica";
  for (const item of items) {
    if (
      item &&
      typeof item === "object" &&
      "fontFamily" in item &&
      typeof item.fontFamily === "string"
    ) {
      font = item.fontFamily;
    }
  }
  return font;
}

function resolveFont(baseFont: string, bold: boolean, italic: boolean): string {
  if (baseFont === "Condensed") return "Condensed";
  const isBold = bold || /Bold/i.test(baseFont);
  const isItalic = italic || /Oblique|Italic/i.test(baseFont);
  if (isBold && isItalic) return "Helvetica-BoldOblique";
  if (isBold) return "Helvetica-Bold";
  if (isItalic) return "Helvetica-Oblique";
  return "Helvetica";
}

function inlineStyle(
  baseFont: string,
  bold: boolean,
  italic: boolean,
): { fontFamily: string; fontWeight?: number } {
  const fontFamily = resolveFont(baseFont, bold, italic);
  if (baseFont === "Condensed") {
    return { fontFamily, fontWeight: bold ? 700 : 400 };
  }
  return { fontFamily };
}

function textLook(style: PdfStyle, fontFamily: string) {
  const items = Array.isArray(style) ? style : [style];
  let fontSize = 8;
  let color = "#64748b";
  let lineHeight = 1.1;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if ("fontSize" in item && typeof item.fontSize === "number") fontSize = item.fontSize;
    if ("color" in item && typeof item.color === "string") color = item.color;
    if ("lineHeight" in item && typeof item.lineHeight === "number") {
      lineHeight = item.lineHeight;
    }
  }
  return { fontFamily, fontSize, color, lineHeight };
}

function renderInline(
  nodes: RichTextNode[],
  baseFont: string,
  marks: { bold: boolean; italic: boolean },
): ReactNode[] {
  const out: ReactNode[] = [];
  nodes.forEach((node, index) => {
    if (node.type === "text") {
      out.push(node.text);
      return;
    }
    if (node.tag === "br") {
      out.push("\n");
      return;
    }
    if (node.tag === "p") {
      if (index > 0) out.push("\n");
      out.push(...renderInline(node.children, baseFont, marks));
      return;
    }
    if (node.tag === "ul" || node.tag === "ol" || node.tag === "li") {
      out.push(...renderInline(node.children, baseFont, marks));
      return;
    }

    const next = {
      bold: marks.bold || node.tag === "strong",
      italic: marks.italic || node.tag === "em",
    };
    const face = inlineStyle(baseFont, next.bold, next.italic);
    const children = renderInline(node.children, baseFont, next);
    const key = `${node.tag}-${index}`;
    if (node.tag === "a" && node.href) {
      out.push(
        <Link
          key={key}
          src={node.href}
          style={{ ...face, color: "#475569", textDecoration: "underline" }}
        >
          {children}
        </Link>,
      );
      return;
    }
    const current = inlineStyle(baseFont, marks.bold, marks.italic);
    if (
      face.fontFamily === current.fontFamily &&
      face.fontWeight === current.fontWeight
    ) {
      out.push(...children);
      return;
    }
    out.push(
      <Text key={key} style={face}>
        {children}
      </Text>,
    );
  });
  return out;
}

function renderBlocks(
  nodes: RichTextNode[],
  look: ReturnType<typeof textLook>,
  baseFont: string,
): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "element" && (node.tag === "ul" || node.tag === "ol")) {
      const items = node.children.filter(
        (child) => child.type === "element" && child.tag === "li",
      );
      return (
        <View key={`list-${index}`}>
          {items.map((item, itemIndex) => (
            <View key={itemIndex} style={{ flexDirection: "row", marginBottom: 1 }}>
              <Text style={look}>{node.tag === "ol" ? `${itemIndex + 1}. ` : "• "}</Text>
              <View style={{ flex: 1 }}>
                <Text style={look}>
                  {renderInline(
                    item.type === "element" ? item.children : [item],
                    baseFont,
                    { bold: false, italic: false },
                  )}
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    }
    return (
      <Text key={`block-${index}`} style={look}>
        {renderInline([node], baseFont, { bold: false, italic: false })}
      </Text>
    );
  });
}

export function PdfRichLabel({ html, style }: { html: string; style?: PdfStyle }) {
  const nodes = parseRichText(html);
  const baseFont = pickFontFamily(style);
  if (!richTextHasList(nodes)) {
    return (
      <Text style={style}>
        {renderInline(nodes, baseFont, { bold: false, italic: false })}
      </Text>
    );
  }
  return (
    <View style={style}>{renderBlocks(nodes, textLook(style, baseFont), baseFont)}</View>
  );
}
