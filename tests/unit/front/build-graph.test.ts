import { describe, expect, it } from "vitest";
import { buildGraph, filterByBranch } from "../../../src/lib/tree/build-graph";
import { LAYOUT } from "../../../src/lib/tree/layout";
import type { PublicTree, PublicTreePerson } from "../../../src/lib/api/types";

function person(overrides: Partial<PublicTreePerson> & { personId: string }): PublicTreePerson {
  return {
    displayName: overrides.displayName ?? `Человек ${overrides.personId}`,
    birthYear: 1900,
    deathYear: 1970,
    isLiving: false,
    branchId: "b_common",
    generation: 1,
    sortOrder: 0,
    years: "1900–1970",
    parentIds: [],
    spouseIds: [],
    childIds: [],
    hasPublicDetails: true,
    avatar: null,
    ...overrides
  };
}

function treeOf(people: PublicTreePerson[]): PublicTree {
  return {
    schemaVersion: "1",
    branches: [
      { branchId: "b_common", label: "Общие предки", sortOrder: 1 },
      { branchId: "b_ivan", label: "Ветвь Ивана", sortOrder: 2 },
      { branchId: "b_peter", label: "Ветвь Петра", sortOrder: 3 }
    ],
    people
  };
}

const demoPeople = (): PublicTreePerson[] => [
  person({ personId: "p_1", generation: 1, spouseIds: ["p_2"], childIds: ["p_3", "p_5"] }),
  person({ personId: "p_2", generation: 1, spouseIds: ["p_1"], childIds: ["p_3", "p_5"] }),
  person({ personId: "p_3", generation: 2, parentIds: ["p_1", "p_2"], childIds: ["p_7"] }),
  person({ personId: "p_5", generation: 2, parentIds: ["p_1", "p_2"], childIds: ["p_9"] }),
  person({ personId: "p_7", generation: 3, parentIds: ["p_3"] }),
  person({ personId: "p_9", generation: 3, parentIds: ["p_5"] })
];

describe("buildGraph", () => {
  it("четыре поколения демо-набора: узлы, слои, связи", () => {
    const graph = buildGraph(demoPeople());
    expect(graph.nodes.length).toBe(6);
    expect(graph.familyLinks.length).toBe(4); // p1→p3, p2→p3, p1→p5, p2→p5 (якорь-пара), p3→p7, p5→p9
    expect(graph.marriageLinks.length).toBe(1);
    const layerOf = (id: string) => graph.nodes.find((node) => node.person.personId === id)!.y;
    expect(layerOf("p_3") - layerOf("p_1")).toBe(LAYOUT.levelHeight);
  });

  it("несколько корней и несвязанные компоненты", () => {
    const people = [
      ...demoPeople(),
      person({ personId: "x_1", generation: 1, spouseIds: ["x_2"] }),
      person({ personId: "x_2", generation: 1, spouseIds: ["x_1"], childIds: ["x_3"] }),
      person({ personId: "x_3", generation: 2, parentIds: ["x_1", "x_2"] })
    ];
    const graph = buildGraph(people);
    expect(graph.nodes.length).toBe(9);
    // Узлы разных компонентов не пересекаются по X внутри одного слоя.
    const layer1 = graph.nodes.filter((node) => node.person.generation === 1).map((node) => node.x);
    const sorted = [...layer1].sort((a, b) => a - b);
    sorted.slice(1).forEach((x, index) => {
      expect(x - sorted[index]).toBeGreaterThan(50);
    });
  });

  it("супруги размещаются рядом", () => {
    const graph = buildGraph(demoPeople());
    const spouse = graph.nodes.find((node) => node.person.personId === "p_2")!;
    const anchor = graph.nodes.find((node) => node.person.personId === "p_1")!;
    expect(Math.abs(spouse.x - anchor.x)).toBe(LAYOUT.spouseGap);
    expect(spouse.y).toBe(anchor.y);
  });

  it("отсутствующие данные не ломают построение", () => {
    const graph = buildGraph([person({ personId: "solo", generation: 1, years: "годы не уточнены", birthYear: null, deathYear: null })]);
    expect(graph.nodes.length).toBe(1);
    expect(graph.familyLinks.length).toBe(0);
  });

  it("центровка: родители стоят по центру своих детей", () => {
    // Веер: корень → двое детей → у каждого по двое внуков.
    const people = [
      person({ personId: "root", generation: 1, childIds: ["a", "b"] }),
      person({ personId: "a", generation: 2, parentIds: ["root"], childIds: ["a1", "a2"] }),
      person({ personId: "b", generation: 2, parentIds: ["root"], childIds: ["b1", "b2"] }),
      person({ personId: "a1", generation: 3, parentIds: ["a"] }),
      person({ personId: "a2", generation: 3, parentIds: ["a"] }),
      person({ personId: "b1", generation: 3, parentIds: ["b"] }),
      person({ personId: "b2", generation: 3, parentIds: ["b"] })
    ];
    const graph = buildGraph(people);
    const x = (id: string) => graph.nodes.find((node) => node.person.personId === id)!.x;
    // Каждый родитель — по центру размаха своих детей, корень — над всей кроной.
    expect(x("a")).toBeCloseTo((x("a1") + x("a2")) / 2);
    expect(x("b")).toBeCloseTo((x("b1") + x("b2")) / 2);
    expect(x("root")).toBeCloseTo((x("a") + x("b")) / 2);
    const gen3 = [x("a1"), x("a2"), x("b1"), x("b2")];
    expect(x("root")).toBeCloseTo((Math.min(...gen3) + Math.max(...gen3)) / 2);
    // Порядок и зазоры в ряду сохраняются.
    expect(x("b") - x("a")).toBeGreaterThanOrEqual(LAYOUT.nodeGap);
  });

  it("центровка: пара центром кластера над детьми, супруги рядом", () => {
    const people = [
      person({ personId: "h", generation: 1, spouseIds: ["w"], childIds: ["k1", "k2"] }),
      person({ personId: "w", generation: 1, spouseIds: ["h"], childIds: ["k1", "k2"] }),
      person({ personId: "k1", generation: 2, parentIds: ["h", "w"] }),
      person({ personId: "k2", generation: 2, parentIds: ["h", "w"] })
    ];
    const graph = buildGraph(people);
    const x = (id: string) => graph.nodes.find((node) => node.person.personId === id)!.x;
    expect((x("h") + x("w")) / 2).toBeCloseTo((x("k1") + x("k2")) / 2);
    expect(Math.abs(x("w") - x("h"))).toBe(LAYOUT.spouseGap);
  });

  it("вершина ветки в центре своей ветки: пары над единственными детьми", () => {
    // Раньше узкие детские блоки сталкивались в ряду и вторая пара уезжала
    // вправо от своего ребёнка; теперь каждая пара — ровно над ним.
    const people = [
      person({ personId: "h1", generation: 1, spouseIds: ["w1"], childIds: ["k1"] }),
      person({ personId: "w1", generation: 1, spouseIds: ["h1"], childIds: ["k1"] }),
      person({ personId: "h2", generation: 1, spouseIds: ["w2"], childIds: ["k2"] }),
      person({ personId: "w2", generation: 1, spouseIds: ["h2"], childIds: ["k2"] }),
      person({ personId: "k1", generation: 2, parentIds: ["h1", "w1"] }),
      person({ personId: "k2", generation: 2, parentIds: ["h2", "w2"] })
    ];
    const graph = buildGraph(people);
    const x = (id: string) => graph.nodes.find((node) => node.person.personId === id)!.x;
    expect((x("h1") + x("w1")) / 2).toBeCloseTo(x("k1"));
    expect((x("h2") + x("w2")) / 2).toBeCloseTo(x("k2"));
  });

  it("асимметричные ветви: каждая вершина в центре своей ветки", () => {
    // Одна ветвь широкая, другая — одиночка: родители всё равно между своими детьми.
    const people = [
      person({ personId: "root", generation: 1, childIds: ["wide", "narrow"] }),
      person({ personId: "wide", generation: 2, parentIds: ["root"], childIds: ["w1", "w2", "w3"] }),
      person({ personId: "narrow", generation: 2, parentIds: ["root"] }),
      person({ personId: "w1", generation: 3, parentIds: ["wide"] }),
      person({ personId: "w2", generation: 3, parentIds: ["wide"] }),
      person({ personId: "w3", generation: 3, parentIds: ["wide"] })
    ];
    const graph = buildGraph(people);
    const x = (id: string) => graph.nodes.find((node) => node.person.personId === id)!.x;
    expect(x("root")).toBeCloseTo((x("wide") + x("narrow")) / 2);
    const wideSpan = [x("w1"), x("w2"), x("w3")];
    expect(x("wide")).toBeCloseTo((Math.min(...wideSpan) + Math.max(...wideSpan)) / 2);
  });

  it("повторный брак: все супруги рядом с якорем, пунктир короткий", () => {
    const people = [
      person({ personId: "p_1", generation: 1, childIds: ["g", "bro"] }),
      person({ personId: "bro", generation: 2, parentIds: ["p_1"], birthYear: 1918 }),
      person({ personId: "g", generation: 2, parentIds: ["p_1"], birthYear: 1920, spouseIds: ["w1", "w2"], childIds: ["kid"] }),
      person({ personId: "w1", generation: 2, birthYear: 1922, spouseIds: ["g"], childIds: ["kid"] }),
      person({ personId: "w2", generation: 2, birthYear: 1935, spouseIds: ["g"] }),
      person({ personId: "kid", generation: 3, parentIds: ["g", "w1"] })
    ];
    const graph = buildGraph(people);
    const node = (id: string) => graph.nodes.find((entry) => entry.person.personId === id)!;
    // Все члены кластера в одном ряду, якорь между супругами.
    expect(node("g").y).toBe(node("w1").y);
    expect(node("g").y).toBe(node("w2").y);
    expect(Math.abs(node("w1").x - node("g").x)).toBe(LAYOUT.spouseGap);
    expect(Math.abs(node("w2").x - node("g").x)).toBe(LAYOUT.spouseGap);
    expect((node("w1").x - node("g").x) * (node("w2").x - node("g").x)).toBeLessThan(0);
    // Брат не попадает между супругами: внутри кластера только сам якорь.
    const inside = graph.nodes
      .filter((entry) => entry.person.generation === 2)
      .filter((entry) => entry.x > Math.min(node("w1").x, node("w2").x) && entry.x < Math.max(node("w1").x, node("w2").x))
      .map((entry) => entry.person.personId);
    expect(inside).toEqual(["g"]);
    // Пунктир каждого брака — между соседними узлами кластера.
    graph.marriageLinks.forEach((link) => {
      expect(Math.abs(link.source.x - link.target.x)).toBe(LAYOUT.spouseGap);
    });
    // Ребёнок первого брака висит между своими родителями.
    const kidLink = graph.familyLinks.find((link) => link.key.endsWith("kid"))!;
    expect(kidLink.source.x).toBe((node("g").x + node("w1").x) / 2);
  });
});

describe("filterByBranch", () => {
  it("ветвь + её предки + супруги; чужие ветви скрыты", () => {
    const people = [
      ...demoPeople().map((p) => ({ ...p, branchId: "b_common" })),
      person({ personId: "i_1", branchId: "b_ivan", generation: 3 }),
      person({ personId: "pe_1", branchId: "b_peter", generation: 3 })
    ];
    const tree = treeOf(people);
    expect(filterByBranch(tree, "all")).toHaveLength(8);
    // У i_1 нет родителей и супругов — только он сам.
    expect(filterByBranch(tree, "b_ivan").map((p) => p.personId)).toEqual(["i_1"]);
    // Ветвь Петра: pe_1 без связей — только он.
    expect(filterByBranch(tree, "b_peter").map((p) => p.personId)).toEqual(["pe_1"]);
  });

  it("предки выбранной ветви видны даже с другой подписью ветви", () => {
    const people = [
      person({ personId: "root", branchId: "b_ancestors", childIds: ["child"] }),
      person({ personId: "inlaw", branchId: "b_ancestors", spouseIds: ["root"], childIds: ["child"] }),
      person({ personId: "child", branchId: "b_ivan", parentIds: ["root", "inlaw"], generation: 2 }),
      person({ personId: "stranger", branchId: "b_ivan" })
    ];
    const visible = filterByBranch(treeOf(people), "b_ivan").map((p) => p.personId).sort();
    // child + его родители (в т.ч. вошедший по браку предок); stranger — тоже ветвь Ивана.
    expect(visible).toEqual(["child", "inlaw", "root", "stranger"]);
  });

  it("супруг включённого человека не разрывает пару", () => {
    const people = [
      person({ personId: "hub", branchId: "b_ivan", spouseIds: ["wife"] }),
      person({ personId: "wife", branchId: "b_other", spouseIds: ["hub"] })
    ];
    const visible = filterByBranch(treeOf(people), "b_ivan").map((p) => p.personId).sort();
    expect(visible).toEqual(["hub", "wife"]);
  });
});
