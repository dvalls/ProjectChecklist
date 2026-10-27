import { describe, expect, it } from "vitest";

import { relocateInGroup, reorderInGroup, reorderSubsetSlots } from "./reorder-groups";

interface Item {
  id: string;
  groupId: string | null;
}

const idOf = (item: Item) => item.id;
const groupOf = (item: Item) => item.groupId;
const setGroup = (item: Item, groupId: string | null): Item => ({ ...item, groupId });

describe("relocateInGroup", () => {
  const items: Item[] = [
    { id: "a1", groupId: "a" },
    { id: "a2", groupId: "a" },
    { id: "b1", groupId: "b" },
    { id: "b2", groupId: "b" },
  ];

  it("move o item para antes do alvo em outro grupo", () => {
    const next = relocateInGroup(items, "a2", "b", "b1", false, idOf, groupOf, setGroup);
    expect(next.map((item) => `${item.groupId}:${item.id}`)).toEqual([
      "a:a1",
      "b:a2",
      "b:b1",
      "b:b2",
    ]);
  });

  it("anexa no grupo quando não há item alvo", () => {
    const next = relocateInGroup(items, "a1", "b", null, false, idOf, groupOf, setGroup);
    expect(next.map((item) => item.id)).toEqual(["a2", "b1", "b2", "a1"]);
    expect(next.find((item) => item.id === "a1")?.groupId).toBe("b");
  });

  it("não altera a lista quando o item já está no grupo", () => {
    expect(relocateInGroup(items, "a1", "a", "a2", false, idOf, groupOf, setGroup)).toBe(
      items,
    );
  });
});

describe("reorderInGroup", () => {
  it("reordena só o grupo ativo", () => {
    const items: Item[] = [
      { id: "a1", groupId: "a" },
      { id: "b1", groupId: "b" },
      { id: "a2", groupId: "a" },
    ];
    const next = reorderInGroup(items, "a", "a2", "a1", idOf, groupOf);
    expect(next.filter((item) => item.groupId === "a").map((item) => item.id)).toEqual([
      "a2",
      "a1",
    ]);
    expect(next.filter((item) => item.groupId === "b").map((item) => item.id)).toEqual([
      "b1",
    ]);
  });
});

describe("reorderSubsetSlots", () => {
  it("coloca a nova ordem do subconjunto nos slots originais", () => {
    expect(reorderSubsetSlots(["a", "b", "c", "d", "e"], ["e", "a", "c"])).toEqual([
      "e",
      "b",
      "a",
      "d",
      "c",
    ]);
  });
});
