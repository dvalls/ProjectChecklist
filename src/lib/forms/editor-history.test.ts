import { describe, expect, it } from "vitest";

import {
  closeCoalesce,
  createEditorHistory,
  pushCoalesced,
  pushDiscrete,
  redo,
  undo,
} from "./editor-history";

describe("editor history", () => {
  it("desfaz e refaz um passo discreto", () => {
    const history = createEditorHistory<string>();
    pushDiscrete(history, "a");
    expect(undo(history, "b")).toBe("a");
    expect(redo(history, "a")).toBe("b");
  });

  it("agrupa edições com a mesma chave num único passo", () => {
    const history = createEditorHistory<string>();
    pushCoalesced(history, "name", "a");
    pushCoalesced(history, "name", "ab");
    pushCoalesced(history, "name", "abc");
    closeCoalesce(history, "abcd");
    expect(history.past).toEqual(["a"]);
    expect(undo(history, "abcd")).toBe("a");
    expect(history.past).toEqual([]);
  });

  it("descarta o passo se o texto voltou ao baseline", () => {
    const history = createEditorHistory<string>();
    pushCoalesced(history, "name", "a");
    closeCoalesce(history, "a");
    expect(history.past).toEqual([]);
    expect(undo(history, "a")).toBeNull();
  });

  it("trocar de chave fecha o grupo anterior", () => {
    const history = createEditorHistory<string>();
    pushCoalesced(history, "name", "a");
    pushCoalesced(history, "description", "ab");
    closeCoalesce(history, "ab!");
    expect(undo(history, "ab!")).toBe("ab");
    expect(undo(history, "ab")).toBe("a");
  });

  it("uma edição nova apaga o futuro", () => {
    const history = createEditorHistory<string>();
    pushDiscrete(history, "a");
    expect(undo(history, "b")).toBe("a");
    pushDiscrete(history, "a");
    expect(redo(history, "c")).toBeNull();
  });

  it("limita o passado a 50 passos", () => {
    const history = createEditorHistory<number>();
    for (let i = 0; i < 60; i++) pushDiscrete(history, i);
    expect(history.past).toHaveLength(50);
    expect(history.past[0]).toBe(10);
    expect(undo(history, 60)).toBe(59);
  });

  it("isola o snapshot guardado de mutações posteriores", () => {
    const history = createEditorHistory<{ n: number }>();
    const current = { n: 1 };
    pushDiscrete(history, current);
    current.n = 2;
    expect(undo(history, current)).toEqual({ n: 1 });
  });

  it("desfaz a digitação aberta como um único passo", () => {
    const history = createEditorHistory<string>();
    pushDiscrete(history, "base");
    pushCoalesced(history, "name", "next");
    expect(undo(history, "next!")).toBe("next");
    expect(undo(history, "next")).toBe("base");
  });
});
