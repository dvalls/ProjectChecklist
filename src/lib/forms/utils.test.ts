import { describe, expect, it } from "vitest";

import type { ClFormField, VisibleWhen } from "@/lib/supabase/types";

import {
  copyEnvironmentValues,
  evaluateVisible,
  isDisplayOnly,
  isFieldAnswered,
  linkEnvironment,
  resolvePrefillValue,
  makeFieldKey,
  parseCheckboxGroup,
  resolveEnvRoot,
  serializeCheckboxGroup,
  syncLinkedField,
} from "./utils";

describe("isDisplayOnly", () => {
  it("returns true for info and image", () => {
    expect(isDisplayOnly("info")).toBe(true);
    expect(isDisplayOnly("image")).toBe(true);
  });
  it("returns false for input types", () => {
    expect(isDisplayOnly("text")).toBe(false);
    expect(isDisplayOnly("checkbox_group")).toBe(false);
  });
});

describe("makeFieldKey", () => {
  it("returns just the id when no env", () => {
    expect(makeFieldKey("abc")).toBe("abc");
  });
  it("appends env after ::", () => {
    expect(makeFieldKey("abc", "env1")).toBe("abc::env1");
  });
});

describe("parseCheckboxGroup / serializeCheckboxGroup", () => {
  it("parses null value", () => {
    expect(parseCheckboxGroup(null)).toEqual({ selected: [] });
  });

  it("parses valid JSON with selected array", () => {
    const json = JSON.stringify({ selected: ["a", "b"], other: "x" });
    expect(parseCheckboxGroup(json)).toEqual({
      selected: ["a", "b"],
      other: "x",
    });
  });

  it("returns empty for malformed JSON", () => {
    expect(parseCheckboxGroup("not json")).toEqual({ selected: [] });
  });

  it("serialize returns null when empty", () => {
    expect(serializeCheckboxGroup({ selected: [] })).toBeNull();
  });

  it("serialize includes other when present", () => {
    const out = serializeCheckboxGroup({ selected: ["a"], other: "x" });
    expect(JSON.parse(out!)).toEqual({ selected: ["a"], other: "x" });
  });

  it("roundtrip preserves data", () => {
    const value: { selected: string[]; other?: string } = {
      selected: ["a", "b"],
    };
    const out = serializeCheckboxGroup(value);
    expect(parseCheckboxGroup(out)).toEqual({ selected: ["a", "b"] });
  });
});

describe("evaluateVisible", () => {
  it("returns true when no condition", () => {
    expect(evaluateVisible(null, {})).toBe(true);
  });

  it("returns false when target field has no value", () => {
    const cond: VisibleWhen = { field_id: "a", op: "truthy" };
    expect(evaluateVisible(cond, {})).toBe(false);
  });

  it("evaluates eq", () => {
    const cond: VisibleWhen = { field_id: "a", op: "eq", value: "yes" };
    expect(evaluateVisible(cond, { a: { value: "yes" } })).toBe(true);
    expect(evaluateVisible(cond, { a: { value: "no" } })).toBe(false);
  });

  it("evaluates truthy on plain values", () => {
    const cond: VisibleWhen = { field_id: "a", op: "truthy" };
    expect(evaluateVisible(cond, { a: { value: "true" } })).toBe(true);
    expect(evaluateVisible(cond, { a: { value: "false" } })).toBe(false);
    expect(evaluateVisible(cond, { a: { value: "" } })).toBe(false);
  });

  it("evaluates truthy on checkbox_group JSON", () => {
    const cond: VisibleWhen = { field_id: "a", op: "truthy" };
    const empty = JSON.stringify({ selected: [] });
    const filled = JSON.stringify({ selected: ["x"] });
    expect(evaluateVisible(cond, { a: { value: empty } })).toBe(false);
    expect(evaluateVisible(cond, { a: { value: filled } })).toBe(true);
  });

  it("evaluates includes against checkbox_group", () => {
    const cond: VisibleWhen = { field_id: "a", op: "includes", value: "x" };
    const value = JSON.stringify({ selected: ["x", "y"] });
    expect(evaluateVisible(cond, { a: { value } })).toBe(true);
    const otherValue = JSON.stringify({ selected: ["y"] });
    expect(evaluateVisible(cond, { a: { value: otherValue } })).toBe(false);
  });

  it("respects env for keying", () => {
    const cond: VisibleWhen = { field_id: "a", op: "eq", value: "x" };
    expect(evaluateVisible(cond, { "a::env1": { value: "x" } }, "env1")).toBe(true);
  });
});

describe("copyEnvironmentValues", () => {
  const fields = [
    { id: "a", type: "radio" as const },
    { id: "b", type: "info" as const },
    { id: "c", type: "checkbox" as const },
  ];

  it("copies source answers and skips display-only and locked cells", () => {
    const values = {
      "a::Sauna": { value: "quente" },
      "a::Suite": { value: "fria" },
      "b::Sauna": { value: "ignorar" },
      "c::Sauna": { value: "false" },
      "c::Suite": { value: "true" },
    };
    const result = copyEnvironmentValues(
      fields,
      values,
      "Sauna",
      ["Suite", "Lavabo"],
      (fieldId, env) => fieldId === "a" && env === "Lavabo",
    );

    expect(result.values["a::Suite"]).toEqual({ value: "quente" });
    expect(result.values["a::Sauna"]).toEqual({ value: "quente" });
    expect(result.values["a::Lavabo"]).toBeUndefined();
    expect(result.values["b::Suite"]).toBeUndefined();
    expect(result.values["c::Suite"]).toEqual({ value: "false" });
    expect(result.values["c::Lavabo"]).toEqual({ value: "false" });
    expect(result.copiedCells).toBe(3);
    expect(result.skippedLocked).toBe(1);
  });
});

describe("environment links", () => {
  it("follows the chain to the root and stops on cycles", () => {
    expect(resolveEnvRoot("Suite", { Suite: "Sauna", Lavabo: "Suite" })).toBe("Sauna");
    expect(resolveEnvRoot("A", { A: "B", B: "A" })).toBe("A");
  });

  it("stores the link and breaks a cycle back to the target", () => {
    const linked = linkEnvironment({ Sauna: "Suite" }, "Suite", "Sauna");
    expect(linked).toEqual({ Suite: "Sauna" });
    expect(linkEnvironment(linked, "Suite", null)).toEqual({});
  });

  it("copies the source answers and later edits onto linked environments", () => {
    const fields = [{ id: "a", type: "radio" as const }];
    const links = { Suite: "Sauna" };
    const copied = syncLinkedField({
      fields,
      values: { "a::Sauna": { value: "quente" }, "a::Suite": { value: null } },
      environments: ["Sauna", "Suite", "Lavabo"],
      links,
      editedEnv: "Suite",
    });
    expect(copied["a::Suite"]).toEqual({ value: "quente" });
    expect(copied["a::Lavabo"]).toBeUndefined();

    const edited = syncLinkedField({
      fields,
      values: { ...copied, "a::Sauna": { value: "fria" } },
      environments: ["Sauna", "Suite"],
      links,
      editedEnv: "Sauna",
      fieldId: "a",
    });
    expect(edited["a::Suite"]).toEqual({ value: "fria" });
  });
});

describe("isFieldAnswered", () => {
  function field(type: ClFormField["type"]): ClFormField {
    return {
      id: "f1",
      template_id: "t1",
      section_id: "s1",
      type,
      label: "F",
      required: false,
      position: 0,
      column_span: 1,
      column_offset: 0,
      visible_when: null,
      options: null,
      created_at: "",
      updated_at: "",
    } as unknown as ClFormField;
  }

  it("checkbox: true only when value is 'true'", () => {
    expect(isFieldAnswered(field("checkbox"), { value: "true" })).toBe(true);
    expect(isFieldAnswered(field("checkbox"), { value: "false" })).toBe(false);
  });

  it("checkbox_group: counts as answered with selections or other", () => {
    expect(
      isFieldAnswered(field("checkbox_group"), {
        value: JSON.stringify({ selected: ["x"] }),
      }),
    ).toBe(true);
    expect(
      isFieldAnswered(field("checkbox_group"), {
        value: JSON.stringify({ selected: [], other: "abc" }),
      }),
    ).toBe(true);
    expect(
      isFieldAnswered(field("checkbox_group"), {
        value: JSON.stringify({ selected: [] }),
      }),
    ).toBe(false);
  });

  it("text: requires non-empty trimmed value", () => {
    expect(isFieldAnswered(field("text"), { value: "  " })).toBe(false);
    expect(isFieldAnswered(field("text"), { value: "x" })).toBe(true);
    expect(isFieldAnswered(field("text"), undefined)).toBe(false);
  });
});

describe("resolvePrefillValue", () => {
  function field(type: ClFormField["type"]): ClFormField {
    return { id: "f1", type } as ClFormField;
  }

  it("keeps a previous answer when the draft slot is empty", () => {
    const text = field("text");
    expect(resolvePrefillValue(text, null, "D+E - #169", true)).toBe("D+E - #169");
    expect(resolvePrefillValue(text, "", "Novo Hamburgo", true)).toBe("Novo Hamburgo");
    expect(resolvePrefillValue(text, "   ", "RS", true)).toBe("RS");
    expect(resolvePrefillValue(field("checkbox"), "false", "true", true)).toBe("true");
  });

  it("keeps a filled draft edit over the previous answer when resubmit is allowed", () => {
    expect(resolvePrefillValue(field("text"), "editado", "original", true)).toBe(
      "editado",
    );
  });

  it("ignores the draft when the previous answer is locked", () => {
    expect(resolvePrefillValue(field("text"), "editado", "original", false)).toBe(
      "original",
    );
    expect(resolvePrefillValue(field("text"), "oi", null, false)).toBe(null);
  });

  it("uses the draft when there is no previous answer", () => {
    expect(resolvePrefillValue(field("text"), "oi", undefined, true)).toBe("oi");
    expect(resolvePrefillValue(field("text"), null, undefined, true)).toBe(null);
    expect(resolvePrefillValue(field("checkbox"), undefined, undefined, false)).toBe(
      "false",
    );
  });
});
