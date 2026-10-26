import { describe, expect, it } from "vitest";

import {
  fieldPlainLabel,
  isSafeHref,
  normalizeHref,
  parseRichText,
  plainTextFromHtml,
  richTextHasList,
  sanitizeFieldHtml,
} from "./rich-text";

describe("sanitizeFieldHtml", () => {
  it("mantém texto puro já salvo", () => {
    expect(sanitizeFieldHtml("Tamanho do ambiente")).toBe("Tamanho do ambiente");
  });

  it("mantém negrito, itálico, listas e link seguro", () => {
    const html = sanitizeFieldHtml(
      '<p>Olá <strong>mundo</strong> <em>itálico</em></p><ol><li>um</li></ol><a href="https://studio.test/a">site</a>',
    );
    expect(html).toContain("<strong>mundo</strong>");
    expect(html).toContain("<em>itálico</em>");
    expect(html).toContain("<ol>");
    expect(html).toContain('href="https://studio.test/a"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("converte b/i e remove script, style e javascript", () => {
    const html = sanitizeFieldHtml(
      '<p onclick="alert(1)"><b>negrito</b> <i>italico</i><script>alert(1)</script></p><a href="javascript:alert(1)">clique</a>',
    );
    expect(html).toContain("<strong>negrito</strong>");
    expect(html).toContain("<em>italico</em>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("clique");
  });

  it("trata vazio e marcação sem texto como string vazia", () => {
    expect(sanitizeFieldHtml("")).toBe("");
    expect(sanitizeFieldHtml("   ")).toBe("");
    expect(sanitizeFieldHtml("<p><br></p>")).toBe("");
    expect(sanitizeFieldHtml(null)).toBe("");
  });
});

describe("plainTextFromHtml", () => {
  it("extrai o texto visível", () => {
    expect(plainTextFromHtml("<p>Olá <strong>mundo</strong></p>")).toBe("Olá mundo");
    expect(plainTextFromHtml("Sala &lt; 10")).toBe("Sala < 10");
    expect(fieldPlainLabel("", "(sem label)")).toBe("(sem label)");
  });
});

describe("normalizeHref", () => {
  it("aceita http, https, mailto e domínio sem protocolo", () => {
    expect(isSafeHref("https://studio.test")).toBe(true);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(normalizeHref("studio.test/guia")).toBe("https://studio.test/guia");
    expect(normalizeHref("mailto:projeto@studiobim.cc")).toBe(
      "mailto:projeto@studiobim.cc",
    );
    expect(normalizeHref("javascript:alert(1)")).toBeNull();
  });
});

describe("parseRichText", () => {
  it("monta parágrafos, marcas e listas", () => {
    const nodes = parseRichText(
      "<p>Olá <strong>mundo</strong></p><ol><li>um</li><li>dois</li></ol>",
    );
    expect(richTextHasList(nodes)).toBe(true);
    expect(nodes[0]).toMatchObject({ type: "element", tag: "p" });
    const list = nodes.find((node) => node.type === "element" && node.tag === "ol");
    expect(list?.type === "element" && list.children).toHaveLength(2);
  });

  it("lê texto puro legado", () => {
    expect(parseRichText("Tamanho do ambiente")).toEqual([
      { type: "text", text: "Tamanho do ambiente" },
    ]);
  });
});
