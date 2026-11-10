/**
 * Контроллер семейного древа: загрузка public.tree, D3-рендер (zoom/drag/reset),
 * список, фильтр ветвей, карточки людей и pending-поток входа для живых родственников.
 * Все данные — из API; mock-данных во frontend нет.
 */
import { select, zoom, zoomIdentity } from "d3";
import { apiGet, apiPost, ApiError } from "../../lib/api/client";
import type { PrivatePerson, PublicPersonCard, PublicTree, PublicTreePerson } from "../../lib/api/types";
import { getToken } from "../../lib/auth/session";
import { store, STORE_EVENTS } from "../../lib/state/archive-store";
import { getFamilyThumbnail } from "../../lib/privacy/family-thumbnails";
import { buildGraph, filterByBranch } from "../../lib/tree/build-graph";
import type { TreeGraph } from "../../lib/tree/build-graph";
import { assetUrl } from "../../lib/urls";
import { formatSoftDate } from "../../lib/dates";
import { handleSessionInvalid, isApiError } from "../../scripts/auth-flow";
import { openMediaInViewer } from "../../scripts/media-viewer";
import { showToast } from "../../scripts/notify";

const NEUTRAL_AVATAR = "assets/portrait-neutral.svg";

/** Фоновый префетч карточек: пауза между запросами и верхняя граница очереди. */
const PREFETCH_PAUSE_MS = 300;
const PREFETCH_MAX = 60;

interface TreeDom {
  root: HTMLElement | null;
  svg: SVGSVGElement | null;
  stage: HTMLElement | null;
  list: HTMLElement | null;
  loading: HTMLElement | null;
  error: HTMLElement | null;
  errorMessage: HTMLElement | null;
  retry: HTMLButtonElement | null;
  branchSelect: HTMLSelectElement | null;
  personDialog: HTMLDialogElement | null;
  personContent: HTMLElement | null;
  personLoading: HTMLElement | null;
  personClose: HTMLButtonElement | null;
  visibleCount: HTMLElement | null;
}

let dom: TreeDom;
let currentBranch = "all";
let currentView: "generations" | "list" = "generations";
let graph: TreeGraph | null = null;
let reduceMotion = false;
let loadFailed = false;

function avatarSource(person: PublicTreePerson | { avatar: PublicTreePerson["avatar"] }): string {
  const avatar = person.avatar;
  if (avatar?.storage === "PUBLIC_ASSET" && avatar.path) return assetUrl(avatar.path);
  if (avatar?.storage === "EXTERNAL" && avatar.url) return avatar.url;
  if (avatar?.storage === "DRIVE_PUBLIC" && avatar.url) return avatar.url;
  return assetUrl(NEUTRAL_AVATAR);
}

function canViewDetails(person: PublicTreePerson): boolean {
  return person.hasPublicDetails || store.familyMode;
}

// ---------------------------------------------------------------------------
// Загрузка данных
// ---------------------------------------------------------------------------

async function loadTree(): Promise<void> {
  showLoading(true);
  try {
    const tree = await apiGet<PublicTree>("public.tree");
    store.setTree(tree);
    loadFailed = false;
    showLoading(false);
    render(true);
    applyPrivacyRefresh();
  } catch (error) {
    loadFailed = true;
    showLoading(false);
    const message = isApiError(error) ? error.userMessage : "Архив временно недоступен.";
    showError(message);
  }
}

function showLoading(visible: boolean): void {
  dom.loading?.toggleAttribute("hidden", !visible);
  if (dom.svg) dom.svg.style.display = visible ? "none" : currentView === "generations" ? "block" : "none";
}

function showError(message: string): void {
  if (dom.errorMessage) dom.errorMessage.textContent = message;
  dom.error?.removeAttribute("hidden");
  dom.list?.setAttribute("hidden", "");
  document.querySelectorAll<HTMLButtonElement>(".tree-toolbar button, .tree-toolbar select").forEach((control) => {
    control.disabled = true;
  });
}

function showErrorStateOnly(): void {
  dom.error?.setAttribute("hidden", "");
  document.querySelectorAll<HTMLButtonElement>(".tree-toolbar button, .tree-toolbar select").forEach((control) => {
    control.disabled = false;
  });
}

// ---------------------------------------------------------------------------
// Рендер
// ---------------------------------------------------------------------------

function visiblePeople(): PublicTreePerson[] {
  if (!store.tree) return [];
  return filterByBranch(store.tree, currentBranch);
}

function render(fit = false): void {
  if (!store.tree || loadFailed) return;
  buildBranchOptions();
  renderGraph();
  renderList();
  updateCount();
  showErrorStateOnly();
  if (dom.svg) dom.svg.style.display = currentView === "generations" ? "block" : "none";
  if (fit) requestAnimationFrame(() => fitTree());
  scheduleVisiblePrefetch();
}

function updateCount(): void {
  if (!dom.visibleCount || !store.tree) return;
  dom.visibleCount.textContent = `${visiblePeople().length} из ${store.tree.people.length} человек`;
}

function buildBranchOptions(): void {
  const select = dom.branchSelect;
  if (!select || !store.tree || select.dataset.filled === "1") return;
  store.tree.branches.forEach((branch) => {
    const option = document.createElement("option");
    option.value = branch.branchId;
    option.textContent = branch.label;
    select.append(option);
  });
  select.dataset.filled = "1";
}

// --- SVG -------------------------------------------------------------------

/* Слои D3: типы ослаблены намеренно — рендер портирован из проверенного макета. */
/* eslint-disable @typescript-eslint/no-explicit-any */
let svgSelection: any = null;
let viewport: any = null;
let familyLinksLayer: any;
let marriageLinksLayer: any;
let nodesLayer: any;
let zoomBehavior: any;

function initSvg(): void {
  if (!dom.svg || svgSelection) return;
  svgSelection = select(dom.svg);
  viewport = svgSelection.append("g").attr("class", "tree-viewport");
  familyLinksLayer = viewport.append("g").attr("class", "family-links");
  marriageLinksLayer = viewport.append("g").attr("class", "marriage-links");
  nodesLayer = viewport.append("g").attr("class", "person-nodes");
  zoomBehavior = zoom()
    .scaleExtent([0.25, 3])
    .on("zoom", (event: any) => {
      viewport?.attr("transform", event.transform.toString());
    });
  svgSelection.call(zoomBehavior).on("dblclick.zoom", null);
}

const linkHorizontal = (source: { x: number; y: number }, target: { x: number; y: number }): string => {
  const xi = (source.x + target.x) / 2;
  return `M${source.x},${source.y}C${xi},${source.y} ${xi},${target.y} ${target.x},${target.y}`;
};

const animationDuration = () => (reduceMotion ? 0 : 300);

function renderGraph(): void {
  initSvg();
  if (!svgSelection || !nodesLayer || !dom.svg) return;
  const people = visiblePeople();
  graph = buildGraph(people);

  const familyLinks = familyLinksLayer.selectAll("path").data(graph.familyLinks, (link: any) => link.key);
  familyLinks
    .enter()
    .append("path")
    .attr("class", "family-link")
    .attr("opacity", 0)
    .merge(familyLinks)
    .transition()
    .duration(animationDuration())
    .attr("d", (link: any) => linkHorizontal(link.source, link.target))
    .attr("opacity", 1);
  familyLinks.exit().transition().duration(animationDuration()).attr("opacity", 0).remove();

  const marriageLinks = marriageLinksLayer.selectAll("path").data(graph.marriageLinks, (link: any) => link.key);
  marriageLinks
    .enter()
    .append("path")
    .attr("class", "marriage-link")
    .attr("opacity", 0)
    .merge(marriageLinks)
    .transition()
    .duration(animationDuration())
    .attr("d", (link: any) => linkHorizontal(link.source, link.target))
    .attr("opacity", 1);
  marriageLinks.exit().transition().duration(animationDuration()).attr("opacity", 0).remove();

  const nodes = nodesLayer.selectAll("g.person-node").data(graph.nodes, (node: any) => node.person.personId);
  const entered = nodes
    .enter()
    .append("g")
    .attr("class", "person-node")
    .attr("data-person-id", (node: any) => node.person.personId)
    .attr("role", "button")
    .attr("tabindex", -1)
    .attr("transform", (node: any) => `translate(${node.x},${node.y})`)
    .attr("opacity", 0)
    .on("click", (event: MouseEvent, node: any) => {
      event.stopPropagation();
      void openPerson(node.person.personId);
    })
    .on("pointerenter", (event: PointerEvent, node: any) => {
      if (event.pointerType === "touch") return;
      hoverPrefetch(node.person.personId);
    })
    .on("keydown", (event: KeyboardEvent, node: any) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void openPerson(node.person.personId);
        return;
      }
      handleNodeArrowKeys(event, node);
    });

  entered
    .append("clipPath")
    .attr("id", (node: any) => `avatar-clip-${node.person.personId}`)
    .append("circle")
    .attr("r", 29);
  entered.append("circle").attr("class", "node-ring").attr("r", 38);
  entered.append("circle").attr("class", "node-inner").attr("r", 30);
  entered
    .append("image")
    .attr("href", (node: any) => avatarSource(node.person))
    .attr("x", -29)
    .attr("y", -29)
    .attr("width", 58)
    .attr("height", 58)
    .attr("preserveAspectRatio", "xMidYMid slice")
    .attr("clip-path", (node: any) => `url(#avatar-clip-${node.person.personId})`);
  entered
    .append("text")
    .attr("class", "node-name")
    .attr("text-anchor", "middle")
    .attr("aria-hidden", "true")
    .attr("y", 54)
    .each(function addName(this: SVGTextElement, node: any) {
      const parts = String(node.person.displayName).split(" ");
      const firstLine = parts.slice(0, -1).join(" ");
      const surname = parts[parts.length - 1];
      select(this).append("tspan").attr("x", 0).text(firstLine);
      select(this).append("tspan").attr("x", 0).attr("dy", 14).text(surname);
    });
  entered
    .append("text")
    .attr("class", "node-years")
    .attr("text-anchor", "middle")
    .attr("aria-hidden", "true")
    .attr("y", 86)
    .text((node: any) => node.person.years);
  entered
    .append("text")
    .attr("class", "node-private")
    .attr("text-anchor", "middle")
    .attr("aria-hidden", "true")
    .attr("y", 102);

  const merged = entered.merge(nodes);
  merged
    .attr("aria-label", (node: any) => {
      const person = node.person as PublicTreePerson;
      // Доступное имя включает весь видимый текст узла (имя, годы, метку приватности).
      const privateLabel = person.hasPublicDetails ? "" : store.familyMode ? "СЕМЕЙНАЯ КАРТОЧКА" : "ДЕТАЛИ ПО ПАРОЛЮ";
      const action = canViewDetails(person) ? "Открыть карточку" : "Подробная информация доступна в семейном режиме";
      return [person.displayName, person.years, privateLabel, action].filter(Boolean).join(" ");
    })
    .classed("is-living", (node: any) => node.person.isLiving);
  merged
    .select(".node-private")
    .text((node: any) => (node.person.hasPublicDetails ? "" : store.familyMode ? "СЕМЕЙНАЯ КАРТОЧКА" : "ДЕТАЛИ ПО ПАРОЛЮ"));
  merged
    .transition()
    .duration(animationDuration())
    .attr("transform", (node: any) => `translate(${node.x},${node.y})`)
    .attr("opacity", 1);
  nodes.exit().transition().duration(animationDuration()).attr("opacity", 0).remove();

  applyRovingTabindex();
}

function applyRovingTabindex(): void {
  const nodeElements = dom.svg?.querySelectorAll<SVGGElement>("g.person-node") ?? [];
  nodeElements.forEach((element, index) => element.setAttribute("tabindex", index === 0 ? "0" : "-1"));
}

function handleNodeArrowKeys(event: KeyboardEvent, currentNode: { x: number; y: number }): void {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const nodeElements = Array.from(dom.svg?.querySelectorAll<SVGGElement>("g.person-node") ?? []);
  if (nodeElements.length === 0) return;
  const positions = new Map<Element, DOMRect>();
  nodeElements.forEach((element) => positions.set(element, element.getBoundingClientRect()));
  const currentRect = positions.get(event.currentTarget as Element);
  if (!currentRect) return;
  let best: Element | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  positions.forEach((rect, element) => {
    if (element === event.currentTarget) return;
    const dx = rect.x + rect.width / 2 - (currentRect.x + currentRect.width / 2);
    const dy = rect.y + rect.height / 2 - (currentRect.y + currentRect.height / 2);
    if (event.key === "ArrowLeft" && dx >= 0) return;
    if (event.key === "ArrowRight" && dx <= 0) return;
    if (event.key === "ArrowUp" && dy >= 0) return;
    if (event.key === "ArrowDown" && dy <= 0) return;
    const score = Math.abs(dx) + Math.abs(dy) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = element;
    }
  });
  if (best) {
    (best as SVGGElement).focus();
  }
}

function fitTree(animate = true): void {
  if (!graph || !graph.nodes.length || !svgSelection || currentView !== "generations" || !dom.stage) return;
  const bounds = dom.stage.getBoundingClientRect();
  const xs = graph.nodes.map((node) => node.x);
  const ys = graph.nodes.map((node) => node.y);
  const minX = Math.min(...xs) - 70;
  const maxX = Math.max(...xs) + 80;
  const minY = Math.min(...ys) - 80;
  const maxY = Math.max(...ys) + 120;
  const graphWidth = Math.max(1, maxX - minX);
  const graphHeight = Math.max(1, maxY - minY);
  let transform;

  if (bounds.width < 600) {
    const root = graph.nodes[0];
    const scale = 0.62;
    const translateX = 60 - root.x * scale;
    const translateY = bounds.height / 2 - root.y * scale - 20;
    transform = zoomIdentity.translate(translateX, translateY).scale(scale);
  } else {
    const scale = Math.max(0.3, Math.min(1, (bounds.width - 90) / graphWidth, (bounds.height - 95) / graphHeight));
    const translateX = (bounds.width - graphWidth * scale) / 2 - minX * scale;
    const translateY = (bounds.height - graphHeight * scale) / 2 - minY * scale - 10;
    transform = zoomIdentity.translate(translateX, translateY).scale(scale);
  }

  if (animate && !reduceMotion) {
    svgSelection.transition().duration(350).call(zoomBehavior.transform, transform);
  } else {
    svgSelection.call(zoomBehavior.transform, transform);
  }
}

// --- Список ----------------------------------------------------------------

function renderList(): void {
  const list = dom.list;
  if (!list) return;
  list.replaceChildren();
  const groups = new Map<number, PublicTreePerson[]>();
  visiblePeople().forEach((person) => {
    const bucket = groups.get(person.generation) ?? [];
    bucket.push(person);
    groups.set(person.generation, bucket);
  });
  [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([generation, people]) => {
      const section = document.createElement("section");
      section.className = "tree-generation";
      const heading = document.createElement("h2");
      heading.textContent = `${generation} поколение`;
      section.append(heading);
      const grid = document.createElement("div");
      grid.className = "tree-list-grid";
      people
        .sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999))
        .forEach((person) => {
          const button = document.createElement("button");
          button.className = `tree-list-item${person.isLiving ? " is-living" : ""}`;
          button.type = "button";
          button.dataset.personId = person.personId;
          const image = document.createElement("img");
          image.src = avatarSource(person);
          image.alt = "";
          image.width = 46;
          image.height = 46;
          const text = document.createElement("span");
          const name = document.createElement("strong");
          name.textContent = person.displayName;
          const years = document.createElement("small");
          years.textContent = person.years;
          text.append(name, years);
          button.append(image, text);
          grid.append(button);
        });
      section.append(grid);
      list.append(section);
    });
}

// ---------------------------------------------------------------------------
// Карточка человека
// ---------------------------------------------------------------------------

function openLoginForPending(personId: string): void {
  store.pendingPersonId = personId;
  document.querySelector<HTMLButtonElement>("[data-open-login]")?.click();
}

async function fetchPrivatePerson(personId: string): Promise<PrivatePerson | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const privateData = await apiPost<PrivatePerson>("private.person", { id: personId, token });
    store.privatePersons.set(personId, privateData);
    return privateData;
  } catch (error) {
    if (isApiError(error) && (error.status === 401 || error.code === "SESSION_INVALID")) {
      handleSessionInvalid();
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Фоновый префетч карточек: после входа (и на hover) данные тянутся заранее,
// и клик по человеку показывает карточку мгновенно.
// ---------------------------------------------------------------------------

let prefetchQueue: string[] = [];
let prefetchScheduled = false;
let hoverPrefetchInFlight = false;

function prefetchNeeded(personId: string): boolean {
  if (store.privatePersons.has(personId)) return false;
  const person = store.getPersonSummary(personId);
  return !(person?.hasPublicDetails && store.cards.has(personId));
}

/** Карточки видимых людей уходят в фоновую очередь с паузами между запросами. */
function scheduleVisiblePrefetch(): void {
  if (!store.familyMode || !getToken()) return;
  const ids = visiblePeople()
    .map((person) => person.personId)
    .filter((id) => prefetchNeeded(id) && !prefetchQueue.includes(id))
    .slice(0, PREFETCH_MAX);
  prefetchQueue.push(...ids);
  pumpPrefetchQueue();
}

function pumpPrefetchQueue(): void {
  if (prefetchScheduled || prefetchQueue.length === 0) return;
  if (document.hidden || !store.familyMode || !getToken()) return; // пауза до видимости/входа
  prefetchScheduled = true;
  window.setTimeout(() => {
    prefetchScheduled = false;
    const personId = prefetchQueue.shift();
    if (personId) void prefetchPerson(personId).finally(() => pumpPrefetchQueue());
  }, PREFETCH_PAUSE_MS);
}

async function prefetchPerson(personId: string): Promise<void> {
  if (!prefetchNeeded(personId)) return;
  const jobs: Array<Promise<unknown>> = [];
  if (store.familyMode && getToken()) jobs.push(fetchPrivatePerson(personId));
  const person = store.getPersonSummary(personId);
  if (person?.hasPublicDetails && !store.cards.has(personId)) {
    jobs.push(
      apiGet<PublicPersonCard>("public.person", { id: personId })
        .then((data) => store.setCard(data))
        .catch(() => undefined)
    );
  }
  await Promise.all(jobs);
}

/** Наведение на узел — тихая догрузка одной карточки (не спамим при проводе мышью). */
function hoverPrefetch(personId: string): void {
  if (hoverPrefetchInFlight || !prefetchNeeded(personId) || !store.familyMode) return;
  hoverPrefetchInFlight = true;
  void prefetchPerson(personId).finally(() => {
    window.setTimeout(() => {
      hoverPrefetchInFlight = false;
    }, 200);
  });
}

async function openPerson(personId: string): Promise<void> {
  const person = store.getPersonSummary(personId);
  if (!person) return;

  // Семейная карточка без сессии → login и запомненная карточка.
  if (!person.hasPublicDetails && !store.familyMode && !getToken()) {
    openLoginForPending(personId);
    return;
  }

  showPersonLoading(true);
  if (!dom.personDialog?.open) {
    dom.personDialog?.showModal();
    document.body.classList.add("dialog-open");
  }

  const requests: Array<Promise<unknown>> = [];
  let card: PublicPersonCard | null = store.cards.get(personId) ?? null;
  if (person.hasPublicDetails && !card) {
    requests.push(
      apiGet<PublicPersonCard>("public.person", { id: personId })
        .then((data) => {
          card = data;
          store.setCard(data);
        })
        .catch((error) => {
          if (isApiError(error) && error.status === 404) throw error;
          throw error;
        })
    );
  }
  if ((store.familyMode || (!person.hasPublicDetails && getToken())) && !store.privatePersons.has(personId)) {
    requests.push(fetchPrivatePerson(personId));
  }

  try {
    await Promise.all(requests);
  } catch {
    showPersonLoading(false);
    renderPersonError();
    return;
  }

  const privateData = store.privatePersons.get(personId) ?? null;
  if (!person.hasPublicDetails && !privateData) {
    // Сессия пропала по пути — предлагаем вход.
    showPersonLoading(false);
    openLoginForPending(personId);
    return;
  }
  showPersonLoading(false);
  renderPersonCard(person, card, privateData);
}

function showPersonLoading(visible: boolean): void {
  dom.personLoading?.toggleAttribute("hidden", !visible);
  if (visible && dom.personContent) {
    dom.personContent.replaceChildren();
    dom.personLoading && dom.personContent.append(dom.personLoading);
  }
  if (dom.personDialog) dom.personDialog.scrollTop = 0;
}

function renderPersonError(): void {
  if (!dom.personContent) return;
  dom.personContent.replaceChildren();
  const box = document.createElement("div");
  box.className = "state-box";
  const title = document.createElement("h3");
  title.textContent = "Не удалось открыть карточку";
  const text = document.createElement("p");
  text.textContent = "Архив временно недоступен. Закройте окно и попробуйте ещё раз.";
  box.append(title, text);
  dom.personContent.append(box);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

/** Заглушка семейного материала: вместо анонимного «🔒» — реальное название. */
function makeFamilyPlaceholder(title: string, isDocument: boolean): HTMLElement {
  const placeholder = el("span", "material-placeholder");
  const icon = el("span", "material-placeholder-icon");
  icon.textContent = isDocument ? "📄" : "🔒";
  const label = el("span", "material-placeholder-title");
  label.textContent = title;
  placeholder.append(icon, label);
  return placeholder;
}

/**
 * Закрытые DRIVE-фото: миниатюра подтягивается отдельным запросом (private.media)
 * и подменяет заглушку с названием, когда придёт. До входа/при ошибке остаётся название.
 */
function loadFamilyThumbnail(button: HTMLButtonElement, person: PublicTreePerson, material: { mediaId: string; title: string; altText: string }): void {
  void getFamilyThumbnail(material.mediaId).then((url) => {
    const cardReplaced = dom.personContent?.dataset.activePerson !== person.personId;
    if (!url || cardReplaced || !button.isConnected) return;
    const image = document.createElement("img");
    image.src = url;
    image.alt = material.altText || material.title;
    image.loading = "lazy";
    button.replaceChildren(image);
  });
}

function relationSection(title: string, people: PublicTreePerson[], relation: string): HTMLElement | null {
  const section = el("section", "person-section");
  const heading = el("h3");
  heading.textContent = title;
  section.append(heading);
  if (people.length === 0) {
    const empty = el("p", "relation-empty");
    empty.textContent = "Сведения отсутствуют.";
    section.append(empty);
    return section;
  }
  const list = el("div", "relation-list");
  people.forEach((person) => {
    const button = el("button", "relation-button");
    button.type = "button";
    button.dataset.personId = person.personId;
    button.textContent = `${person.displayName} (${person.years})`;
    button.setAttribute("data-relation", relation);
    list.append(button);
  });
  section.append(list);
  return section;
}

function renderPersonCard(person: PublicTreePerson, card: PublicPersonCard | null, privateData: PrivatePerson | null): void {
  if (!dom.personContent) return;
  dom.personContent.replaceChildren();

  const avatar = card?.avatar ?? person.avatar;
  const avatarUrl =
    avatar?.storage === "PUBLIC_ASSET" && avatar.path
      ? assetUrl(avatar.path)
      : avatar?.storage === "EXTERNAL" && avatar.url
        ? avatar.url
        : avatar?.storage === "DRIVE_PUBLIC" && avatar.url
          ? avatar.url
          : assetUrl(NEUTRAL_AVATAR);

  const profile = el("div", "person-profile");
  const photo = document.createElement("img");
  photo.className = "person-photo";
  photo.src = avatarUrl;
  photo.alt = `Фотография: ${person.displayName}`;
  photo.width = 300;
  photo.height = 400;
  photo.onerror = () => {
    photo.src = assetUrl(NEUTRAL_AVATAR);
  };
  const copy = el("div", "person-profile-copy");
  const eyebrow = el("p", "eyebrow");
  eyebrow.textContent = `${person.generation} поколение`;
  const name = el("h2");
  name.id = "person-name";
  name.textContent = person.displayName;
  const years = el("p", "person-years");
  years.textContent = person.years;
  const status = el("span", "person-status");
  status.textContent = person.isLiving
    ? "Живой родственник · семейный доступ"
    : person.hasPublicDetails
      ? "Предок · общедоступная карточка"
      : "Предок · семейная карточка";
  copy.append(eyebrow, name, years, status);
  profile.append(photo, copy);
  dom.personContent.append(profile);

  if (!person.hasPublicDetails) {
    const note = el("p", "private-card-note");
    note.textContent = "Эта карточка доступна только в семейном режиме.";
    dom.personContent.append(note);
  }

  // Биография: семейная версия приоритетна, затем публичная.
  const bio = privateData?.bio || card?.bio || "";
  const birthPlace = privateData?.birthPlace || card?.birthPlace || "";
  const birthExact = privateData?.birth?.date ?? card?.birth?.date ?? null;
  const deathExact = card?.death?.date ?? null;
  const bioSection = el("section", "person-section person-biography");
  const bioHeading = el("h3");
  bioHeading.textContent = "Биография";
  bioSection.append(bioHeading);
  if (bio) {
    const paragraph = el("p");
    paragraph.textContent = bio;
    bioSection.append(paragraph);
  }
  if (birthPlace) {
    const paragraph = el("p");
    paragraph.textContent = `Место рождения: ${birthPlace}.`;
    bioSection.append(paragraph);
  }
  if (birthExact) {
    const paragraph = el("p");
    paragraph.textContent = `Дата рождения: ${formatSoftDate(birthExact)}`;
    bioSection.append(paragraph);
  }
  if (deathExact) {
    const paragraph = el("p");
    paragraph.textContent = `Дата смерти: ${formatSoftDate(deathExact)}`;
    bioSection.append(paragraph);
  }
  if (!bio && !birthPlace && !birthExact && !deathExact) {
    const paragraph = el("p");
    paragraph.textContent = "Биография пока не заполнена в семейном архиве.";
    bioSection.append(paragraph);
  }
  dom.personContent.append(bioSection);

  if (privateData?.contacts || privateData?.notes) {
    const familySection = el("section", "person-section");
    const familyHeading = el("h3");
    familyHeading.textContent = "Семейные сведения";
    familySection.append(familyHeading);
    if (privateData.contacts) {
      const paragraph = el("p");
      paragraph.style.fontSize = "0.85rem";
      paragraph.style.color = "var(--muted)";
      paragraph.textContent = `Контакты: ${privateData.contacts}`;
      familySection.append(paragraph);
    }
    if (privateData.notes) {
      const paragraph = el("p");
      paragraph.style.fontSize = "0.85rem";
      paragraph.style.color = "var(--muted)";
      paragraph.textContent = `Заметки: ${privateData.notes}`;
      familySection.append(paragraph);
    }
    dom.personContent.append(familySection);
  }

  const byId = (id: string) => store.getPersonSummary(id);
  const parents = (person.parentIds.map(byId).filter(Boolean) as PublicTreePerson[]);
  const spouses = person.spouseIds.map(byId).filter(Boolean) as PublicTreePerson[];
  const children = person.childIds.map(byId).filter(Boolean) as PublicTreePerson[];
  dom.personContent.append(relationSection("Родители", parents, "parent")!);
  if (spouses.length) dom.personContent.append(relationSection("Супруг(а)", spouses, "spouse")!);
  dom.personContent.append(relationSection("Дети", children, "child")!);

  // Связанные материалы: публичные напрямую, семейные — через private.media.
  const gallery = el("section", "person-section");
  const galleryHeading = el("h3");
  galleryHeading.textContent = "Связанные материалы";
  gallery.append(galleryHeading);
  const grid = el("div", "person-gallery");
  const publicMaterials = card?.materials ?? [];
  publicMaterials.forEach((material) => {
    const source = material.path ? assetUrl(material.path) : material.url;
    if (!source) return;
    const button = el("button");
    button.type = "button";
    button.setAttribute("aria-label", `Открыть материал: ${material.title}`);
    const image = document.createElement("img");
    image.src = source;
    image.alt = material.altText || material.title;
    image.loading = "lazy";
    image.onerror = () => {
      image.remove();
    };
    button.append(image);
    button.addEventListener("click", () => {
      void openMediaInViewer({
        mediaId: material.mediaId,
        title: material.title,
        caption: material.caption || material.title,
        altText: material.altText,
        publicUrl: source
      });
    });
    grid.append(button);
  });
  (privateData?.materials ?? []).forEach((material) => {
    const button = el("button");
    button.type = "button";
    // Прямые ссылки (внешние и фото из Drive) открываются сразу;
    // закрытые DRIVE-файлы — через private.media: фото как миниатюра, документы названием.
    const directUrl = material.storage === "EXTERNAL" || material.storage === "DRIVE_PUBLIC" ? material.url : null;
    const isImage = material.mediaType !== "document";
    if (directUrl && isImage) {
      const image = document.createElement("img");
      image.src = directUrl;
      image.alt = material.altText || material.title;
      image.loading = "lazy";
      image.onerror = () => {
        image.remove();
        button.append(makeFamilyPlaceholder(material.title, false));
      };
      button.append(image);
    } else {
      button.append(makeFamilyPlaceholder(material.title, !isImage));
      if (material.storage === "DRIVE" && isImage) loadFamilyThumbnail(button, person, material);
    }
    button.setAttribute("aria-label", `Открыть семейный материал: ${material.title}`);
    button.addEventListener("click", () => {
      void openMediaInViewer({
        mediaId: material.mediaId,
        title: material.title,
        caption: material.caption || material.title,
        altText: material.altText,
        publicUrl: directUrl,
        requiresSession: !directUrl
      });
    });
    grid.append(button);
  });
  if (grid.childElementCount === 0) {
    const empty = el("p", "relation-empty");
    empty.textContent = "Материалы пока не связаны в архиве.";
    gallery.append(empty);
  } else {
    gallery.append(grid);
  }
  dom.personContent.append(gallery);
  dom.personContent.dataset.activePerson = person.personId;

  dom.personClose?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// События и инициализация
// ---------------------------------------------------------------------------

function setView(view: "generations" | "list"): void {
  currentView = view;
  const isList = view === "list";
  if (dom.svg) dom.svg.style.display = isList ? "none" : "block";
  dom.list?.toggleAttribute("hidden", !isList);
  document.querySelectorAll<HTMLButtonElement>("[data-tree-view]").forEach((button) => {
    const isActive = button.dataset.treeView === view;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  document.querySelectorAll<HTMLButtonElement>(".zoom-controls button").forEach((button) => {
    button.disabled = isList;
  });
  if (!isList) requestAnimationFrame(() => fitTree(false));
}

function applyPrivacyRefresh(): void {
  renderGraph();
  if (!store.familyMode && dom.personDialog?.open) {
    // Карточка семейная — закрыть при выходе из семейного режима.
    const activePerson = dom.personContent?.querySelector("[data-active-person]")?.getAttribute("data-active-person");
    if (activePerson) {
      const person = store.getPersonSummary(activePerson);
      if (person && !person.hasPublicDetails) dom.personDialog.close();
    }
  }
}

export function initFamilyTree(): void {
  dom = {
    root: document.getElementById("tree-root"),
    svg: document.getElementById("family-tree") as SVGSVGElement | null,
    stage: document.getElementById("tree-stage"),
    list: document.getElementById("tree-list"),
    loading: document.getElementById("tree-loading"),
    error: document.getElementById("tree-error"),
    errorMessage: document.getElementById("tree-error-message"),
    retry: document.getElementById("tree-retry") as HTMLButtonElement | null,
    branchSelect: document.getElementById("branch-select") as HTMLSelectElement | null,
    personDialog: document.getElementById("person-dialog") as HTMLDialogElement | null,
    personContent: document.getElementById("person-content"),
    personLoading: document.getElementById("person-loading"),
    personClose: document.getElementById("person-close") as HTMLButtonElement | null,
    visibleCount: document.getElementById("visible-count")
  };
  if (!dom.root || !dom.svg) return;
  reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  dom.retry?.addEventListener("click", () => {
    dom.error?.setAttribute("hidden", "");
    void loadTree();
  });

  document.getElementById("zoom-in")?.addEventListener("click", () => {
    svgSelection?.transition().duration(reduceMotion ? 0 : 220).call(zoomBehavior.scaleBy, 1.25);
  });
  document.getElementById("zoom-out")?.addEventListener("click", () => {
    svgSelection?.transition().duration(reduceMotion ? 0 : 220).call(zoomBehavior.scaleBy, 0.8);
  });
  document.getElementById("zoom-reset")?.addEventListener("click", () => fitTree());

  document.querySelectorAll<HTMLButtonElement>("[data-tree-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.treeView as "generations" | "list"));
  });

  dom.branchSelect?.addEventListener("change", () => {
    currentBranch = dom.branchSelect?.value ?? "all";
    if (dom.personDialog?.open) dom.personDialog.close();
    render(true);
  });

  dom.personClose?.addEventListener("click", () => dom.personDialog?.close());
  dom.personContent?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-person-id]");
    if (button) void openPerson(button.dataset.personId as string);
  });
  dom.list?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-person-id]");
    if (button) void openPerson(button.dataset.personId as string);
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => fitTree(false), 120);
  });

  store.addEventListener(STORE_EVENTS.TREE, () => render());
  store.addEventListener(STORE_EVENTS.FAMILY_CHANGE, () => {
    applyPrivacyRefresh();
    const pending = store.pendingPersonId;
    if (pending && store.familyMode) {
      store.pendingPersonId = null;
      void openPerson(pending);
    }
    if (store.familyMode) scheduleVisiblePrefetch();
  });
  store.addEventListener(STORE_EVENTS.RESET_PRIVATE, () => {
    prefetchQueue = [];
    applyPrivacyRefresh();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) pumpPrefetchQueue();
  });

  void loadTree();
}

if (document.getElementById("tree-root")) {
  initFamilyTree();
}
