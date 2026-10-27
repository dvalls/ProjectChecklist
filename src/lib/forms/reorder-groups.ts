export function relocateInGroup<T>(
  items: T[],
  activeId: string,
  targetGroupId: string | null,
  overId: string | null,
  placeAfter: boolean,
  idOf: (item: T) => string,
  groupOf: (item: T) => string | null,
  setGroup: (item: T, groupId: string | null) => T,
): T[] {
  const active = items.find((item) => idOf(item) === activeId);
  if (!active || groupOf(active) === targetGroupId) return items;

  const moved = setGroup(active, targetGroupId);
  const rest = items.filter((item) => idOf(item) !== activeId);

  if (!overId) {
    let insertAt = rest.length;
    for (let index = rest.length - 1; index >= 0; index -= 1) {
      if (groupOf(rest[index]) === targetGroupId) {
        insertAt = index + 1;
        break;
      }
    }
    rest.splice(insertAt, 0, moved);
    return rest;
  }

  const overIndex = rest.findIndex((item) => idOf(item) === overId);
  if (overIndex < 0) {
    rest.push(moved);
    return rest;
  }
  rest.splice(placeAfter ? overIndex + 1 : overIndex, 0, moved);
  return rest;
}

export function reorderInGroup<T>(
  items: T[],
  groupId: string | null,
  activeId: string,
  overId: string,
  idOf: (item: T) => string,
  groupOf: (item: T) => string | null,
): T[] {
  if (activeId === overId) return items;
  const inGroup = items.filter((item) => groupOf(item) === groupId);
  const others = items.filter((item) => groupOf(item) !== groupId);
  const oldIndex = inGroup.findIndex((item) => idOf(item) === activeId);
  const newIndex = inGroup.findIndex((item) => idOf(item) === overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return items;
  const next = [...inGroup];
  const [removed] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, removed);
  return [...others, ...next];
}

/** Reordena um subconjunto sem mexer na posição relativa dos itens de fora. */
export function reorderSubsetSlots(
  order: string[],
  subsetInNewOrder: string[],
): string[] {
  const subset = new Set(subsetInNewOrder);
  const queue = subsetInNewOrder.filter((id, index) => {
    return order.includes(id) && subsetInNewOrder.indexOf(id) === index;
  });
  return order.map((id) => {
    if (!subset.has(id)) return id;
    return queue.shift() ?? id;
  });
}
