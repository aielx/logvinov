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
