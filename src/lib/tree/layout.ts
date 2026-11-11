/**
 * Раскладка древа: слои по поколениям, кластеры браков рядом с якорем.
 * Юнит размещения — кластер брака (якорь + супруги) или одиночка. Ветки
 * строятся рекурсивно с контурной упаковкой (Reingold–Tilford): дети идут
 * подряд, каждая следующая ветка сдвигается вправо лишь настолько, насколько
 * её ряды задевают ряды предыдущих, а кластер родителя ставится ровно
 * между центрами крайних детей — «вершина ветки» висит в центре своей ветки.
 * Повторные браки: якорь между супругами, пунктиры короткие. Ребёнок двух
 * семей размещается в первой ветке, вторая тянет к нему связь.
 * Детерминированная, без перекрытий.
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

/** Контур ветви: ряд → самая левая и самая правая точка по X. */
type Contour = Map<number, [number, number]>;

interface Subtree {
  contour: Contour;
  /** Центр кластера юнита (после всех сдвигов). */
  center: number;
  /** Все размещённые люди ветви — для сдвига ветви целиком. */
  people: string[];
}

export function computeLayout(
  people: PublicTreePerson[],
  byId: Map<string, PublicTreePerson>,
  spouseOf: Map<string, string>
): LayoutResult {
  const childrenOf = new Map<string, string[]>();
  people.forEach((person) => {
    person.childIds.forEach((childId) => {
      if (!byId.has(childId)) return;
      const list = childrenOf.get(person.personId) ?? [];
      if (!list.includes(childId)) list.push(childId);
      childrenOf.set(person.personId, list);
    });
  });

  const byBirth = (a: string, b: string) => {
    const personA = byId.get(a);
    const personB = byId.get(b);
    return (personA?.birthYear ?? 9999) - (personB?.birthYear ?? 9999) || a.localeCompare(b);
  };

  // Кластеры браков: якорь → супруги (по рождению: старшие левее) — из карты сопровождений.
  const accompaniersOf = new Map<string, string[]>();
  spouseOf.forEach((anchor, member) => {
    const list = accompaniersOf.get(anchor) ?? [];
    list.push(member);
    accompaniersOf.set(anchor, list);
  });
  accompaniersOf.forEach((list) => list.sort(byBirth));

  const generationOf = (personId: string): number => byId.get(personId)?.generation ?? 1;

  // Юнит = кластер брака (представитель — якорь) или одиночка (представитель — сам человек).
  const unitMembers = new Map<string, string[]>();
  const unitOf = (personId: string): string => spouseOf.get(personId) ?? personId;
  people.forEach((person) => {
    const representative = unitOf(person.personId);
    const list = unitMembers.get(representative) ?? [];
    list.push(person.personId);
    unitMembers.set(representative, list);
  });

  /** Члены юнита слева направо: один супруг — справа от якоря, несколько — якорь между ними. */
  const membersOf = (representative: string): string[] => {
    const accompaniers = accompaniersOf.get(representative) ?? [];
    const leftCount = accompaniers.length >= 2 ? Math.floor(accompaniers.length / 2) : 0;
    return [...accompaniers.slice(0, leftCount), representative, ...accompaniers.slice(leftCount)];
  };

  // Юниты-дети: дети всех членов (сначала якоря, затем супруги, по рождению),
  // переведённые в юниты и без дублей. Циклы в данных разрываются при обходе.
  const childUnits = new Map<string, string[]>();
  unitMembers.forEach((_members, representative) => {
    const seen = new Set<string>();
    const units: string[] = [];
    membersOf(representative).forEach((memberId) => {
      (childrenOf.get(memberId) ?? []).slice().sort(byBirth).forEach((childId) => {
        const childUnit = unitOf(childId);
        if (seen.has(childUnit) || childUnit === representative) return;
        seen.add(childUnit);
        units.push(childUnit);
      });
    });
    childUnits.set(representative, units);
  });

  const positions = new Map<string, { x: number; y: number }>();
  const placedUnits = new Set<string>();
  const visiting = new Set<string>();

  const mergeRight = (right: Map<number, number>, contour: Contour): void => {
    contour.forEach(([left, rightEdge], generation) => {
      right.set(generation, Math.max(right.get(generation) ?? Number.NEGATIVE_INFINITY, rightEdge));
    });
  };

  const shiftSubtree = (subtree: Subtree, delta: number): void => {
    if (delta === 0) return;
    subtree.people.forEach((personId) => {
      positions.get(personId)!.x += delta;
    });
    subtree.contour.forEach((edge) => {
      edge[0] += delta;
      edge[1] += delta;
    });
    subtree.center += delta;
  };

  /**
   * Размещает ветвь юнита: дети — подряд, кластер — ровно между центрами
   * крайних детей; затем вся ветвь отодвигается вправо от уже размещённых
   * соседей слева (контурная упаковка по каждому ряду).
   */
  const placeUnit = (representative: string, prevRight: Map<number, number>): Subtree => {
    visiting.add(representative);
    const generation = generationOf(representative);
    const members = membersOf(representative);
    const clusterWidth = (members.length - 1) * LAYOUT.spouseGap;

    const kidsRight = new Map<number, number>();
    const kidSubtrees: Subtree[] = [];
    (childUnits.get(representative) ?? []).forEach((kid) => {
      if (visiting.has(kid) || placedUnits.has(kid)) return;
      const subtree = placeUnit(kid, kidsRight);
      mergeRight(kidsRight, subtree.contour);
      kidSubtrees.push(subtree);
    });

    // Пробное размещение от нуля; финальный сдвиг против соседей слева — ниже.
    const center =
      kidSubtrees.length > 0 ? (kidSubtrees[0].center + kidSubtrees[kidSubtrees.length - 1].center) / 2 : 0;
    const y = (generation - 1) * LAYOUT.levelHeight;
    const memberLeft = center - clusterWidth / 2;
    members.forEach((memberId, index) => {
      positions.set(memberId, { x: memberLeft + index * LAYOUT.spouseGap, y });
    });

    // Контур ветви: потомки + собственный кластер в своём ряду.
    const contour: Contour = new Map();
    const extend = (generation2: number, left: number, right2: number): void => {
      const edge = contour.get(generation2);
      contour.set(generation2, [
        Math.min(edge?.[0] ?? Number.POSITIVE_INFINITY, left),
        Math.max(edge?.[1] ?? Number.NEGATIVE_INFINITY, right2)
      ]);
    };
    kidSubtrees.forEach((subtree) => {
      subtree.contour.forEach(([left, right2], generation2) => extend(generation2, left, right2));
    });
    extend(generation, memberLeft, memberLeft + clusterWidth);

    // Отодвинуться от соседей слева: по каждому общему ряду — зазор nodeGap.
    let shift = 0;
    prevRight.forEach((rightEdge, generation2) => {
      const edge = contour.get(generation2);
      if (edge) shift = Math.max(shift, rightEdge + LAYOUT.nodeGap - edge[0]);
    });
    const subtree: Subtree = {
      contour,
      center,
      people: [...members, ...kidSubtrees.flatMap((kid) => kid.people)]
    };
    shiftSubtree(subtree, shift);

    visiting.delete(representative);
    placedUnits.add(representative);
    return subtree;
  };

  // Корни: юниты, чьими детьми никто не объявлен; порядок — по поколению и рождению якоря.
  const childUnitSet = new Set<string>();
  childUnits.forEach((units) => units.forEach((unit) => childUnitSet.add(unit)));
  const rootUnits = [...unitMembers.keys()]
    .filter((representative) => !childUnitSet.has(representative))
    .sort((a, b) => generationOf(a) - generationOf(b) || byBirth(a, b) || a.localeCompare(b));

  const packRoots = (units: string[]): void => {
    const right = new Map<number, number>();
    units.forEach((representative) => {
      if (placedUnits.has(representative)) return;
      const subtree = placeUnit(representative, right);
      mergeRight(right, subtree.contour);
    });
  };
  packRoots(rootUnits);
  // Изолированные узлы (циклические остатки данных): размещаются последними.
  packRoots([...unitMembers.keys()]);

  let generationCount = 1;
  positions.forEach((position) => {
    const generation = Math.round(position.y / LAYOUT.levelHeight) + 1;
    generationCount = Math.max(generationCount, generation);
  });

  return { positions, generationCount };
}
