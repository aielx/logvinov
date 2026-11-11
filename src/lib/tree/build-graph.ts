/**
 * Построитель графа семейного древа из нормализованных данных API.
 *
 * В отличие от макета (одна иерархия по fatherId от корня id=1) поддерживает:
 *  - обоих родителей (PARENT_CHILD в обе стороны);
 *  - несколько корней и несвязанные компоненты;
 *  - нормализованные браки (одна запись на пару);
 *  - отсутствующие даты/родителей без потери узлов.
 *
 * Чистый модуль без DOM — покрыт unit-тестами.
 */
import type { PublicTree, PublicTreePerson } from "../api/types";
import { computeLayout } from "./layout";

export interface GraphNode {
  person: PublicTreePerson;
  x: number;
  y: number;
  /** Якорь кластера браков, рядом с которым размещён человек (null — сам якорь или без брака). */
  spouseOf: string | null;
}

export interface GraphLink {
  key: string;
  source: { x: number; y: number };
  target: { x: number; y: number };
}

export interface TreeGraph {
  nodes: GraphNode[];
  /** Связи родитель(ы)→ребёнок. */
  familyLinks: GraphLink[];
  /** Брачные связи. */
  marriageLinks: GraphLink[];
  generationCount: number;
}

/**
 * Фильтр ветви: люди выбранной ветви + все их предки (контекст древа)
 * + супруги включённых, чтобы пары не разрывались. Чужие ветви скрыты,
 * даже если их подпись стоит у кого-то из «безродительских» людей.
 */
export function filterByBranch(tree: PublicTree, branchId: string | "all"): PublicTreePerson[] {
  if (branchId === "all") return tree.people;
  const byId = new Map(tree.people.map((person) => [person.personId, person]));
  const keep = new Set<string>();
  const queue = tree.people.filter((person) => person.branchId === branchId).map((person) => person.personId);
  while (queue.length > 0) {
    const personId = queue.pop() as string;
    if (keep.has(personId)) continue;
    keep.add(personId);
    (byId.get(personId)?.parentIds ?? []).forEach((parentId) => {
      if (byId.has(parentId) && !keep.has(parentId)) queue.push(parentId);
    });
  }
  Array.from(keep).forEach((personId) => {
    (byId.get(personId)?.spouseIds ?? []).forEach((spouseId) => {
      if (byId.has(spouseId)) keep.add(spouseId);
    });
  });
  return tree.people.filter((person) => keep.has(person.personId));
}

export function buildGraph(people: PublicTreePerson[]): TreeGraph {
  const byId = new Map(people.map((person) => [person.personId, person]));
  const spouseOf = new Map<string, string>();

  // Канонизация браков: пара (a,b), a < b; каждая пара — один раз.
  const spousePairs: Array<[string, string]> = [];
  const pairSeen = new Set<string>();
  people.forEach((person) => {
    person.spouseIds.forEach((spouseId) => {
      if (!byId.has(spouseId)) return;
      const key = [person.personId, spouseId].sort().join("+");
      if (pairSeen.has(key)) return;
      pairSeen.add(key);
      spousePairs.push([person.personId, spouseId].sort() as [string, string]);
    });
  });
  // Кластеры браков: компонента связности браков — звезда вокруг якоря.
  // Якорь — кровный член древа (есть родители на графе), при равенстве — тот,
  // у кого больше браков (повторный брак не разрывает кластер), затем меньший id.
  // Все остальные супруги сопровождают якорь и встают рядом с ним.
  const partnersOf = new Map<string, string[]>();
  spousePairs.forEach(([a, b]) => {
    const listA = partnersOf.get(a) ?? [];
    listA.push(b);
    partnersOf.set(a, listA);
    const listB = partnersOf.get(b) ?? [];
    listB.push(a);
    partnersOf.set(b, listB);
  });
  const hasTreeParents = new Set<string>();
  people.forEach((person) => {
    if (person.parentIds.some((parentId) => byId.has(parentId))) hasTreeParents.add(person.personId);
  });
  const anchorFirst = (a: string, b: string): number =>
    Number(hasTreeParents.has(b)) - Number(hasTreeParents.has(a)) ||
    (partnersOf.get(a)?.length ?? 0) - (partnersOf.get(b)?.length ?? 0) ||
    a.localeCompare(b);
  const clustered = new Set<string>();
  people.forEach((person) => {
    if (clustered.has(person.personId) || !partnersOf.has(person.personId)) return;
    const component: string[] = [];
    const queue = [person.personId];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      if (clustered.has(current)) continue;
      clustered.add(current);
      component.push(current);
      (partnersOf.get(current) ?? []).forEach((partnerId) => {
        if (!clustered.has(partnerId)) queue.push(partnerId);
      });
    }
    const [anchor, ...spouses] = component.sort(anchorFirst);
    spouses.forEach((spouseId) => spouseOf.set(spouseId, anchor));
  });

  const layout = computeLayout(people, byId, spouseOf);

  const nodes: GraphNode[] = people.map((person) => {
    const position = layout.positions.get(person.personId) ?? { x: 0, y: 0 };
    return { person, x: position.x, y: position.y, spouseOf: spouseOf.get(person.personId) ?? null };
  });
  const positionOf = (personId: string) => {
    const person = byId.get(personId);
    const position = layout.positions.get(personId);
    return person && position ? { person, position } : null;
  };

  // Связи родитель(ы)→ребёнок: якорь — середина пары родителей, иначе узел родителя.
  const familyLinks: GraphLink[] = [];
  people.forEach((child) => {
    const childAnchor = positionOf(child.personId);
    if (!childAnchor) return;
    const presentParents = child.parentIds
      .map((parentId) => positionOf(parentId))
      .filter((entry): entry is { person: PublicTreePerson; position: { x: number; y: number } } => entry !== null);
    if (presentParents.length === 0) return;
    const anchorX = presentParents.reduce((sum, entry) => sum + entry.position.x, 0) / presentParents.length;
    const anchorY = presentParents[0].position.y;
    familyLinks.push({
      key: `family-${presentParents.map((entry) => entry.person.personId).sort().join("-")}-${child.personId}`,
      source: { x: anchorX, y: anchorY },
      target: { x: childAnchor.position.x, y: childAnchor.position.y }
    });
  });

  const marriageLinks: GraphLink[] = spousePairs
    .map(([a, b]) => {
      const left = positionOf(a);
      const right = positionOf(b);
      if (!left || !right) return null;
      return {
        key: `marriage-${[a, b].sort().join("-")}`,
        source: { x: left.position.x, y: left.position.y },
        target: { x: right.position.x, y: right.position.y }
      };
    })
    .filter((link): link is GraphLink => link !== null);

  return {
    nodes,
    familyLinks,
    marriageLinks,
    generationCount: layout.generationCount
  };
}
