/**
 * Раскладка древа: слои по поколениям, кластеры браков рядом с якорем, DFS-порядок ветвей.
 * При повторных браках якорь размещается между супругами — пунктир каждого брака
 * остаётся коротким и не тянется через других людей поколения.
 * Детерминированная, без перекрытий: каждому поколению — свой курсор по X.
 */
import type { PublicTreePerson } from "../api/types";

export const LAYOUT = {
  /** Горизонтальный зазор между одиночными узлами. */
  nodeGap: 200,
  /** Смещение супруга от партнёра. */
  spouseGap: 130,
  /** Высота слоя поколения. */
  levelHeight: 290
} as const;

export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  generationCount: number;
}

export function computeLayout(
  people: PublicTreePerson[],
  byId: Map<string, PublicTreePerson>,
  spouseOf: Map<string, string>
): LayoutResult {
  const childrenOf = new Map<string, string[]>();
  const hasParents = new Set<string>();
  people.forEach((person) => {
    person.childIds.forEach((childId) => {
      if (!byId.has(childId)) return;
      const list = childrenOf.get(person.personId) ?? [];
      if (!list.includes(childId)) list.push(childId);
      childrenOf.set(person.personId, list);
    });
    person.parentIds.forEach((parentId) => {
      if (byId.has(parentId)) hasParents.add(person.personId);
    });
  });

  const byBirth = (a: string, b: string) => {
    const personA = byId.get(a);
    const personB = byId.get(b);
    return (personA?.birthYear ?? 9999) - (personB?.birthYear ?? 9999) || a.localeCompare(b);
  };

  // Корни: без родителей в текущем наборе; порядок — по поколению и рождению.
  const roots = people
    .filter((person) => !hasParents.has(person.personId))
    .sort((a, b) => a.generation - b.generation || (a.birthYear ?? 9999) - (b.birthYear ?? 9999) || a.personId.localeCompare(b.personId))
    .map((person) => person.personId);

  const positions = new Map<string, { x: number; y: number }>();
  const nextX = new Map<number, number>();
  const placed = new Set<string>();
  const visiting = new Set<string>();
  // Якорь кластера → супруги (по рождению: старшие левее) — из карты сопровождений.
  const accompaniersOf = new Map<string, string[]>();
  spouseOf.forEach((anchor, member) => {
    const list = accompaniersOf.get(anchor) ?? [];
    list.push(member);
    accompaniersOf.set(anchor, list);
  });
  accompaniersOf.forEach((list) => list.sort(byBirth));

  const generationOf = (personId: string): number => byId.get(personId)?.generation ?? 1;

  const placeCluster = (anchorId: string): void => {
    const generation = generationOf(anchorId);
    const y = (generation - 1) * LAYOUT.levelHeight;
    const cursor = nextX.get(generation) ?? 0;
    const accompaniers = (accompaniersOf.get(anchorId) ?? []).filter(
      (memberId) => !placed.has(memberId) && !visiting.has(memberId) && byId.has(memberId)
    );
    // Один супруг — справа от якоря (как раньше); несколько — якорь между ними,
    // чтобы пунктир каждого брака шёл только между соседними узлами.
    const leftCount = accompaniers.length >= 2 ? Math.floor(accompaniers.length / 2) : 0;
    const members = [...accompaniers.slice(0, leftCount), anchorId, ...accompaniers.slice(leftCount)];
    members.forEach((memberId, index) => {
      positions.set(memberId, { x: cursor + index * LAYOUT.spouseGap, y });
      placed.add(memberId);
    });
    nextX.set(generation, cursor + (members.length - 1) * LAYOUT.spouseGap + LAYOUT.nodeGap);
  };

  const visit = (personId: string): void => {
    if (placed.has(personId) || visiting.has(personId) || !byId.has(personId)) return;
    visiting.add(personId);
    // Кластер брака: если сопровождаю якорь — размещаемся от него (якорь мог ещё не размещён).
    let anchor = personId;
    const myAnchor = spouseOf.get(personId);
    if (myAnchor && !placed.has(myAnchor) && !visiting.has(myAnchor)) anchor = myAnchor;
    placeCluster(anchor);
    // Дети всех членов кластера: сначала якоря, затем супругов (в порядке рождения).
    [anchor, ...(accompaniersOf.get(anchor) ?? [])].forEach((memberId) => {
      (childrenOf.get(memberId) ?? []).slice().sort(byBirth).forEach((childId) => visit(childId));
    });
    visiting.delete(personId);
  };

  roots.forEach(visit);
  // Изолированные узлы (циклические остатки): размещаются последними.
  people.forEach((person) => visit(person.personId));

  let generationCount = 1;
  positions.forEach((position) => {
    const generation = Math.round(position.y / LAYOUT.levelHeight) + 1;
    generationCount = Math.max(generationCount, generation);
  });

  return { positions, generationCount };
}
