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
  /** Позиция не назначена (изолированный конфликт раскладки) — не бывает при текущем алгоритме. */
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
 * Фильтр ветви: выбранная ветвь + общие предки (первая ветвь по sortOrder).
 * Общие предки нужны, чтобы у отфильтрованных людей сохранялись родительские связи.
 */
export function filterByBranch(tree: PublicTree, branchId: string | "all"): PublicTreePerson[] {
  if (branchId === "all") return tree.people;
  const commonBranchId = tree.branches.length > 0 ? tree.branches[0].branchId : "";
  return tree.people.filter((person) => person.branchId === branchId || person.branchId === commonBranchId);
}

export function buildGraph(people: PublicTreePerson[]): TreeGraph {
  const byId = new Map(people.map((person) => [person.personId, person]));
  const spouseOf = new Map<string, string>();

  // Канонизация браков: пара (a,b), a < b; каждый человек — не более чем в одном браке на графе.
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
  // Схема раскладки: супруг рисуется рядом с первым партнёром.
  spousePairs.forEach(([a, b]) => {
    if (!spouseOf.has(a) && !spouseOf.has(b)) {
      spouseOf.set(b, a);
    } else if (!spouseOf.has(a)) {
      spouseOf.set(a, b);
    } else if (!spouseOf.has(b)) {
      spouseOf.set(b, a);
    }
  });

  const layout = computeLayout(people, byId, spousePairs, spouseOf);

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
