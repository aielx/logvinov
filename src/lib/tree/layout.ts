/**
 * Раскладка древа: слои по поколениям, пары супругов рядом, DFS-порядок ветвей.
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
  spousePairs: Array<[string, string]>,
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
  // Сопровождающий → якорь и якорь → сопровождающий для симметричного поиска пары.
  const accompaniedOf = new Map<string, string>();
  spousePairs.forEach(([a, b]) => {
    if (spouseOf.get(b) === a) accompaniedOf.set(a, b);
  });

  const generationOf = (personId: string): number => byId.get(personId)?.generation ?? 1;

  const placePair = (personId: string, spouseId: string | null): void => {
    const generation = generationOf(personId);
    const cursor = nextX.get(generation) ?? 0;
    positions.set(personId, { x: cursor, y: (generation - 1) * LAYOUT.levelHeight });
    placed.add(personId);
    let advance = LAYOUT.nodeGap;
    if (spouseId && !placed.has(spouseId) && byId.has(spouseId)) {
      positions.set(spouseId, { x: cursor + LAYOUT.spouseGap, y: positions.get(personId)!.y });
      placed.add(spouseId);
      advance = LAYOUT.spouseGap + LAYOUT.nodeGap;
    }
    nextX.set(generation, cursor + advance);
  };

  const visit = (personId: string): void => {
    if (placed.has(personId) || visiting.has(personId) || !byId.has(personId)) return;
    visiting.add(personId);
    // Определяем пару: я сопровождаю партнёра (spouseOf) или партнёр сопровождает меня.
    let anchor = personId;
    let partner: string | null = accompaniedOf.get(personId) ?? null;
    if (!partner && spouseOf.has(personId)) {
      anchor = spouseOf.get(personId) as string;
      partner = personId;
      if (placed.has(anchor) || visiting.has(anchor)) {
        // Якорь уже размещён отдельно: сопровождающий встаёт одиночным узлом.
        anchor = personId;
        partner = null;
      }
    }
    placePair(anchor, partner);
    const children = (childrenOf.get(anchor) ?? []).slice().sort(byBirth);
    children.forEach((childId) => visit(childId));
    // Дети партнёра, если партнёр не посещён как родитель.
    if (partner) {
      const partnerChildren = (childrenOf.get(partner) ?? []).slice().sort(byBirth);
      partnerChildren.forEach((childId) => {
        if (!placed.has(childId)) visit(childId);
      });
    }
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
