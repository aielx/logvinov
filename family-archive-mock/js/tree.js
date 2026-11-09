const mockData = [
  {
    id: 1,
    name: "Иван Петрович Логвинов",
    birth: 1890,
    death: 1955,
    fatherId: null,
    motherId: null,
    spouseId: 2,
    generation: 1,
    bio: "Крестьянин и основатель известной нам ветви рода. В семейных воспоминаниях сохранился образ человека трудолюбивого, немногословного и очень справедливого.",
    photo: "assets/portrait-man-1.svg",
    branch: "common",
    isPublic: true
  },
  {
    id: 2,
    name: "Мария Ивановна Логвинова",
    birth: 1895,
    death: 1960,
    fatherId: null,
    motherId: null,
    spouseId: 1,
    generation: 1,
    bio: "Хранительница домашнего очага и семейной корреспонденции. Именно её письма легли в основу первых страниц этого демонстрационного архива.",
    photo: "assets/portrait-woman-1.svg",
    branch: "common",
    isPublic: true
  },
  {
    id: 3,
    name: "Иван Иванович Логвинов",
    birth: 1918,
    death: 1978,
    fatherId: 1,
    motherId: 2,
    spouseId: 4,
    generation: 2,
    bio: "Старший сын Ивана и Марии. Его биография связана с военными годами, восстановлением родного хозяйства и последующим переездом семьи.",
    photo: "assets/portrait-man-2.svg",
    branch: "ivan",
    isPublic: true
  },
  {
    id: 4,
    name: "Анна Сергеевна Логвинова",
    birth: 1921,
    death: 1990,
    fatherId: null,
    motherId: null,
    spouseId: 3,
    generation: 2,
    bio: "Жена Ивана Ивановича, школьная учительница. Сохранила семейные фотографии и записала воспоминания старших родственников.",
    photo: "assets/portrait-woman-2.svg",
    branch: "ivan",
    isPublic: true
  },
  {
    id: 5,
    name: "Пётр Иванович Логвинов",
    birth: 1922,
    death: 1985,
    fatherId: 1,
    motherId: 2,
    spouseId: 6,
    generation: 2,
    bio: "Младший сын Ивана и Марии, мастер столярного дела. От него начинается отдельная ветвь рода, представленная в интерактивном фильтре.",
    photo: "assets/portrait-man-1.svg",
    branch: "peter",
    isPublic: true
  },
  {
    id: 6,
    name: "Екатерина Андреевна Логвинова",
    birth: 1926,
    death: 2001,
    fatherId: null,
    motherId: null,
    spouseId: 5,
    generation: 2,
    bio: "Жена Петра Ивановича. Её рассказы о семейных традициях, переездах и повседневной жизни стали важной частью устной истории рода.",
    photo: "assets/portrait-woman-1.svg",
    branch: "peter",
    isPublic: true
  },
  {
    id: 7,
    name: "Сергей Иванович Логвинов",
    birth: 1947,
    death: 2000,
    fatherId: 3,
    motherId: 4,
    spouseId: null,
    generation: 3,
    bio: "Сын Ивана Ивановича и Анны Сергеевны, инженер. Собрал и систематизировал документы старших поколений, продолжив работу семейного архива.",
    photo: "assets/portrait-man-2.svg",
    branch: "ivan",
    isPublic: true
  },
  {
    id: 8,
    name: "Алексей Сергеевич Логвинов",
    birth: 1975,
    death: null,
    fatherId: 7,
    motherId: null,
    spouseId: null,
    generation: 4,
    bio: "Представитель четвёртого поколения ветви Ивана. Эта демонстрационная карточка показывает, как в архиве будут представлены живые родственники.",
    photo: "assets/portrait-man-1.svg",
    branch: "ivan",
    isPublic: false
  },
  {
    id: 9,
    name: "Борис Петрович Логвинов",
    birth: 1950,
    death: 2010,
    fatherId: 5,
    motherId: 6,
    spouseId: null,
    generation: 3,
    bio: "Сын Петра Ивановича и Екатерины Андреевны. Краевед и фотолюбитель, благодаря которому в архиве появились снимки родных мест.",
    photo: "assets/portrait-man-2.svg",
    branch: "peter",
    isPublic: true
  },
  {
    id: 10,
    name: "Дмитрий Борисович Логвинов",
    birth: 1978,
    death: null,
    fatherId: 9,
    motherId: null,
    spouseId: null,
    generation: 4,
    bio: "Представитель четвёртого поколения ветви Петра. Имя и годы видны в публичном древе, а подробная карточка доступна после входа в семейный режим.",
    photo: "assets/portrait-man-1.svg",
    branch: "peter",
    isPublic: false
  }
];

const mockTimeline = [
  { date: "1890", sortDate: "1890", title: "Рождение Ивана Петровича", description: "Начало документированной истории рода в этом макете. Будущий глава семьи и основатель двух известных ветвей.", type: "family", icon: "Р" },
  { date: "1895", sortDate: "1895", title: "Рождение Марии Ивановны", description: "Будущая хранительница семейных писем и фотографий. Впоследствии её записи помогут восстановить семейную хронологию.", type: "family", icon: "Р" },
  { date: "1917", sortDate: "1917", title: "Революция и начало новой эпохи", description: "Политические и социальные перемены затронули повседневную жизнь семьи, её хозяйство и планы на будущее.", type: "history", icon: "И" },
  { date: "1918", sortDate: "1918", title: "Рождение Ивана Ивановича", description: "В семье Ивана и Марии родился старший сын — начало ветви Ивана на интерактивном древе.", type: "family", icon: "Р" },
  { date: "1922", sortDate: "1922", title: "Рождение Петра Ивановича", description: "Родился второй сын. Его потомки составят отдельную ветвь семейного древа.", type: "family", icon: "Р" },
  { date: "1941–1945", sortDate: "1941", title: "Великая Отечественная война", description: "Исторический контекст жизни второго поколения. В рабочем архиве здесь появятся военные документы и семейные воспоминания.", type: "history", icon: "И" },
  { date: "1946", sortDate: "1946", title: "Брак Ивана и Анны", description: "Послевоенная семейная фотография и воспоминания об этом дне представлены в галерее как примеры архивных материалов.", type: "family", icon: "Б" },
  { date: "1947", sortDate: "1947", title: "Рождение Сергея Ивановича", description: "Новый представитель третьего поколения, который позднее систематизирует семейные документы.", type: "family", icon: "Р" },
  { date: "1952", sortDate: "1952", title: "Переезд в районный центр", description: "Пример важного семейного события: смена места жительства, новая работа и начало следующего этапа истории семьи.", type: "family", icon: "П" },
  { date: "1970-е", sortDate: "1970", title: "Четвёртое поколение", description: "Родились Алексей Сергеевич и Дмитрий Борисович. Их карточки доступны только после входа в семейный режим.", type: "family", icon: "Р" },
  { date: "2025", sortDate: "2025", title: "Начало цифрового архива", description: "Родственники объединяют материалы и воспоминания, чтобы создать общую, доступную следующим поколениям историю рода.", type: "family", icon: "А" }
];

const mockGallery = [
  { id: 1, src: "assets/archive-family.svg", title: "Семья Логвиновых у дома", date: "1930-е", category: "archive", categoryLabel: "Архивное фото", alt: "Стилизованная семейная фотография у деревянного дома" },
  { id: 2, src: "assets/archive-document.svg", title: "Метрическая запись Ивана Петровича", date: "1890", category: "documents", categoryLabel: "Документ", alt: "Стилизованная метрическая запись на старой бумаге" },
  { id: 3, src: "assets/archive-portrait.svg", title: "Портрет Ивана Петровича", date: "около 1935 года", category: "portraits", categoryLabel: "Портрет", alt: "Стилизованный портрет мужчины в архивной рамке" },
  { id: 4, src: "assets/archive-wedding.svg", title: "Свадьба Ивана и Анны", date: "1946", category: "archive", categoryLabel: "Архивное фото", alt: "Стилизованная свадебная фотография" },
  { id: 5, src: "assets/archive-letter.svg", title: "Письмо с фронта", date: "1944", category: "documents", categoryLabel: "Документ", alt: "Стилизованное письмо военных лет" },
  { id: 6, src: "assets/portrait-woman-2.svg", title: "Портрет Анны Сергеевны", date: "1950-е", category: "portraits", categoryLabel: "Портрет", alt: "Стилизованный портрет женщины" },
  { id: 7, src: "assets/archive-house.svg", title: "Дом в родной деревне", date: "1950-е", category: "archive", categoryLabel: "Архивное фото", alt: "Стилизованный снимок деревянного сельского дома" },
  { id: 8, src: "assets/archive-workbook.svg", title: "Страница трудовой книжки", date: "1938", category: "documents", categoryLabel: "Документ", alt: "Стилизованная страница трудовой книжки" }
];

function initFamilyTree() {
  const svgElement = document.getElementById("family-tree");
  const stage = document.getElementById("tree-stage");
  const listElement = document.getElementById("tree-list");
  const errorElement = document.getElementById("tree-error");
  const branchSelect = document.getElementById("branch-select");
  const personDialog = document.getElementById("person-dialog");
  const personContent = document.getElementById("person-content");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let isPrivate = document.body.classList.contains("is-private");
  let currentBranch = "all";
  let currentView = "generations";
  let visiblePeople = [];
  let graph = null;

  const escapeHTML = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);

  const getYears = (person) => `${person.birth}–${person.death || "н. в."}`;
  const canView = (person) => person.isPublic || isPrivate;

  function getVisiblePeople() {
    return mockData.filter((person) => currentBranch === "all" || person.branch === "common" || person.branch === currentBranch);
  }

  function relationButtons(relatives) {
    if (!relatives.length) return '<p class="relation-empty">Сведения отсутствуют в макете.</p>';
    return `<div class="relation-list">${relatives.map((person) => `
      <button class="relation-button" type="button" data-person-id="${person.id}">${escapeHTML(person.name)}</button>
    `).join("")}</div>`;
  }

  function openPerson(personId) {
    const person = mockData.find((item) => item.id === Number(personId));
    if (!person) return;
    if (!canView(person)) {
      document.querySelector(".header-access")?.click();
      return;
    }

    const father = mockData.find((item) => item.id === person.fatherId);
    const mother = mockData.find((item) => item.id === person.motherId);
    const spouse = mockData.find((item) => item.id === person.spouseId);
    const children = mockData.filter((item) => item.fatherId === person.id || item.motherId === person.id);
    const parents = [father, mother].filter((item) => item && canView(item));
    const accessibleChildren = children.filter(canView);
    const accessibleSpouse = spouse && canView(spouse) ? [spouse] : [];
    const gallery = Array.from({ length: 4 }, (_, index) => mockGallery[(person.id * 2 + index) % mockGallery.length]);

    personContent.innerHTML = `
      <div class="person-profile">
        <img class="person-photo" src="${person.photo}" alt="Фотография: ${escapeHTML(person.name)} (заглушка)" width="300" height="400">
        <div class="person-profile-copy">
          <p class="eyebrow">${person.generation} поколение</p>
          <h2 id="person-name">${escapeHTML(person.name)}</h2>
          <p class="person-years">${getYears(person)}</p>
          <span class="person-status">${person.death ? "Предок · общедоступная карточка" : "Живой родственник · семейный доступ"}</span>
        </div>
      </div>
      ${person.isPublic ? "" : '<p class="private-card-note">Эта карточка видна только в демонстрационном семейном режиме.</p>'}
      <section class="person-section person-biography" aria-labelledby="bio-heading">
        <h3 id="bio-heading">Биография</h3>
        <p>${escapeHTML(person.bio)}</p>
        <p>Здесь будет развёрнутый рассказ о детстве, месте рождения и семейном окружении. Текст можно дополнить воспоминаниями родственников и цитатами из личных писем.</p>
        <p>В этот раздел войдут сведения о работе, службе, переездах и важных событиях. Каждый факт можно будет связать с документом или фотографией из семейного архива.</p>
      </section>
      <section class="person-section" aria-labelledby="parents-heading"><h3 id="parents-heading">Родители</h3>${relationButtons(parents)}</section>
      ${accessibleSpouse.length ? `<section class="person-section" aria-labelledby="spouse-heading"><h3 id="spouse-heading">Супруг(а)</h3>${relationButtons(accessibleSpouse)}</section>` : ""}
      <section class="person-section" aria-labelledby="children-heading"><h3 id="children-heading">Дети</h3>${relationButtons(accessibleChildren)}</section>
      <section class="person-section" aria-labelledby="person-gallery-heading">
        <h3 id="person-gallery-heading">Связанные материалы</h3>
        <div class="person-gallery">${gallery.map((item) => `<img src="${item.src}" alt="${escapeHTML(item.alt)}" loading="lazy">`).join("")}</div>
      </section>
    `;

    if (!personDialog.open) personDialog.showModal();
    document.body.classList.add("dialog-open");
    personDialog.scrollTop = 0;
    document.getElementById("person-close").focus({ preventScroll: true });
  }

  function renderList() {
    const groups = new Map();
    visiblePeople.forEach((person) => {
      if (!groups.has(person.generation)) groups.set(person.generation, []);
      groups.get(person.generation).push(person);
    });

    listElement.innerHTML = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([generation, people]) => `
      <section class="tree-generation" aria-labelledby="generation-${generation}">
        <h2 id="generation-${generation}">${generation} поколение</h2>
        <div class="tree-list-grid">${people.sort((a, b) => a.birth - b.birth).map((person) => `
          <button class="tree-list-item${person.death ? "" : " is-living"}" type="button" data-person-id="${person.id}">
            <img src="${person.photo}" alt="" width="46" height="46">
            <span><strong>${escapeHTML(person.name)}</strong><small>${getYears(person)}</small></span>
          </button>
        `).join("")}</div>
      </section>
    `).join("");
  }

  personContent.addEventListener("click", (event) => {
    const button = event.target.closest("[data-person-id]");
    if (button) openPerson(button.dataset.personId);
  });
  listElement.addEventListener("click", (event) => {
    const button = event.target.closest("[data-person-id]");
    if (button) openPerson(button.dataset.personId);
  });
  document.getElementById("person-close").addEventListener("click", () => personDialog.close());

  if (!window.d3) {
    errorElement.hidden = false;
    document.querySelectorAll(".tree-toolbar button, .tree-toolbar select").forEach((control) => { control.disabled = true; });
    return;
  }

  const svg = d3.select(svgElement);
  const viewport = svg.append("g").attr("class", "tree-viewport");
  const familyLinksLayer = viewport.append("g").attr("class", "family-links");
  const marriageLinksLayer = viewport.append("g").attr("class", "marriage-links");
  const nodesLayer = viewport.append("g").attr("class", "person-nodes");
  const linkHorizontal = d3.linkHorizontal().x((point) => point.x).y((point) => point.y);
  const spouseOffset = 130;
  const animationDuration = reduceMotion ? 0 : 300;

  const zoom = d3.zoom()
    .scaleExtent([0.25, 3])
    .on("zoom", (event) => viewport.attr("transform", event.transform));
  svg.call(zoom).on("dblclick.zoom", null);

  function buildGraph(people) {
    const rootPerson = people.find((person) => person.id === 1);
    const hierarchy = d3.hierarchy(rootPerson, (person) => people.filter((candidate) => candidate.fatherId === person.id));
    d3.tree().nodeSize([180, 300])(hierarchy);

    const primaryNodes = hierarchy.descendants().map((item) => ({
      person: item.data,
      x: item.y,
      y: item.x,
      generation: item.depth + 1,
      source: item
    }));
    const primaryById = new Map(primaryNodes.map((node) => [node.person.id, node]));
    const spouseNodes = [];

    primaryNodes.forEach((node) => {
      const spouse = people.find((person) => person.id === node.person.spouseId);
      if (spouse) {
        spouseNodes.push({
          person: spouse,
          x: node.x + spouseOffset,
          y: node.y,
          generation: node.generation,
          spouseOf: node.person.id
        });
      }
    });

    const spouseIds = new Set(spouseNodes.map((node) => node.spouseOf));
    const familyLinks = hierarchy.links().map((link) => {
      const source = primaryById.get(link.source.data.id);
      const target = primaryById.get(link.target.data.id);
      return {
        key: `${link.source.data.id}-${link.target.data.id}`,
        source: { x: source.x + (spouseIds.has(source.person.id) ? spouseOffset / 2 : 0), y: source.y },
        target: { x: target.x, y: target.y }
      };
    });
    const marriageLinks = spouseNodes.map((spouseNode) => {
      const primary = primaryById.get(spouseNode.spouseOf);
      return {
        key: `marriage-${spouseNode.spouseOf}`,
        source: { x: primary.x, y: primary.y },
        target: { x: spouseNode.x, y: spouseNode.y }
      };
    });

    return { primaryNodes, spouseNodes, nodes: [...primaryNodes, ...spouseNodes], familyLinks, marriageLinks };
  }

  function renderGraph() {
    graph = buildGraph(visiblePeople);
    const familyLinks = familyLinksLayer.selectAll("path").data(graph.familyLinks, (link) => link.key);
    familyLinks.enter()
      .append("path")
      .attr("class", "family-link")
      .attr("d", linkHorizontal)
      .attr("opacity", 0)
      .merge(familyLinks)
      .transition().duration(animationDuration)
      .attr("d", linkHorizontal)
      .attr("opacity", 1);
    familyLinks.exit().transition().duration(animationDuration).attr("opacity", 0).remove();

    const marriageLinks = marriageLinksLayer.selectAll("path").data(graph.marriageLinks, (link) => link.key);
    marriageLinks.enter()
      .append("path")
      .attr("class", "marriage-link")
      .attr("d", linkHorizontal)
      .attr("opacity", 0)
      .merge(marriageLinks)
      .transition().duration(animationDuration)
      .attr("d", linkHorizontal)
      .attr("opacity", 1);
    marriageLinks.exit().transition().duration(animationDuration).attr("opacity", 0).remove();

    const nodes = nodesLayer.selectAll("g.person-node").data(graph.nodes, (node) => node.person.id);
    const entered = nodes.enter().append("g")
      .attr("class", "person-node")
      .attr("data-person-id", (node) => node.person.id)
      .attr("role", "button")
      .attr("tabindex", 0)
      .attr("transform", (node) => `translate(${node.x},${node.y})`)
      .attr("opacity", 0)
      .on("click", (event, node) => {
        event.stopPropagation();
        openPerson(node.person.id);
      })
      .on("keydown", (event, node) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPerson(node.person.id);
        }
      });

    entered.append("clipPath")
      .attr("id", (node) => `avatar-clip-${node.person.id}`)
      .append("circle")
      .attr("r", 29);
    entered.append("circle").attr("class", "node-ring").attr("r", 38);
    entered.append("circle").attr("class", "node-inner").attr("r", 30);
    entered.append("image")
      .attr("href", (node) => node.person.photo)
      .attr("x", -29)
      .attr("y", -29)
      .attr("width", 58)
      .attr("height", 58)
      .attr("preserveAspectRatio", "xMidYMid slice")
      .attr("clip-path", (node) => `url(#avatar-clip-${node.person.id})`);
    entered.append("text")
      .attr("class", "node-name")
      .attr("text-anchor", "middle")
      .attr("y", 54)
      .each(function addName(node) {
        const parts = node.person.name.split(" ");
        const firstLine = parts.slice(0, -1).join(" ");
        const surname = parts[parts.length - 1];
        d3.select(this).append("tspan").attr("x", 0).text(firstLine);
        d3.select(this).append("tspan").attr("x", 0).attr("dy", 14).text(surname);
      });
    entered.append("text")
      .attr("class", "node-years")
      .attr("text-anchor", "middle")
      .attr("y", 86)
      .text((node) => getYears(node.person));
    entered.append("text")
      .attr("class", "node-private")
      .attr("text-anchor", "middle")
      .attr("y", 102)
      .text((node) => node.person.isPublic ? "" : "СЕМЕЙНАЯ КАРТОЧКА");

    const merged = entered.merge(nodes);
    merged
      .attr("aria-label", (node) => `${node.person.name}, ${getYears(node.person)}. ${canView(node.person) ? "Открыть карточку" : "Подробная информация доступна в семейном режиме"}`)
      .classed("is-living", (node) => !node.person.death);
    merged.select(".node-private")
      .text((node) => node.person.isPublic ? "" : isPrivate ? "СЕМЕЙНАЯ КАРТОЧКА" : "ДЕТАЛИ ПО ПАРОЛЮ");
    merged.transition().duration(animationDuration)
      .attr("transform", (node) => `translate(${node.x},${node.y})`)
      .attr("opacity", 1);
    nodes.exit().transition().duration(animationDuration).attr("opacity", 0).remove();
  }

  function fitTree(animate = true) {
    if (!graph || !graph.nodes.length || currentView !== "generations") return;
    const bounds = stage.getBoundingClientRect();
    const minX = d3.min(graph.nodes, (node) => node.x) - 70;
    const maxX = d3.max(graph.nodes, (node) => node.x) + 80;
    const minY = d3.min(graph.nodes, (node) => node.y) - 80;
    const maxY = d3.max(graph.nodes, (node) => node.y) + 120;
    const graphWidth = Math.max(1, maxX - minX);
    const graphHeight = Math.max(1, maxY - minY);
    let transform;

    if (bounds.width < 600) {
      const root = graph.primaryNodes.find((node) => node.person.id === 1);
      const scale = 0.62;
      const translateX = 60 - root.x * scale;
      const translateY = bounds.height / 2 - root.y * scale - 20;
      transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
    } else {
      const scale = Math.max(0.3, Math.min(1, (bounds.width - 90) / graphWidth, (bounds.height - 95) / graphHeight));
      const translateX = (bounds.width - graphWidth * scale) / 2 - minX * scale;
      const translateY = (bounds.height - graphHeight * scale) / 2 - minY * scale - 10;
      transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
    }

    if (animate && !reduceMotion) {
      svg.transition().duration(350).call(zoom.transform, transform);
    } else {
      svg.call(zoom.transform, transform);
    }
  }

  function render(fit = false) {
    visiblePeople = getVisiblePeople();
    renderGraph();
    renderList();
    const countElement = document.getElementById("visible-count");
    countElement.textContent = `${visiblePeople.length} из ${mockData.length} человек`;
    countElement.setAttribute("aria-live", "polite");
    if (fit) requestAnimationFrame(() => fitTree());
  }

  function setView(view) {
    currentView = view;
    const isList = view === "list";
    svgElement.style.display = isList ? "none" : "block";
    listElement.hidden = !isList;
    document.querySelectorAll("[data-tree-view]").forEach((button) => {
      const isActive = button.dataset.treeView === view;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    document.querySelectorAll(".zoom-controls button").forEach((button) => { button.disabled = isList; });
    if (!isList) requestAnimationFrame(() => fitTree(false));
  }

  document.getElementById("zoom-in").addEventListener("click", () => {
    svg.transition().duration(reduceMotion ? 0 : 220).call(zoom.scaleBy, 1.25);
  });
  document.getElementById("zoom-out").addEventListener("click", () => {
    svg.transition().duration(reduceMotion ? 0 : 220).call(zoom.scaleBy, 0.8);
  });
  document.getElementById("zoom-reset").addEventListener("click", () => fitTree());
  document.querySelectorAll("[data-tree-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.treeView));
  });
  branchSelect.addEventListener("change", () => {
    currentBranch = branchSelect.value;
    if (personDialog.open) personDialog.close();
    render(true);
  });
  window.addEventListener("family:privacychange", (event) => {
    const nextPrivacy = Boolean(event.detail.isPrivate);
    if (nextPrivacy === isPrivate) return;
    isPrivate = nextPrivacy;
    if (!isPrivate && personDialog.open) personDialog.close();
    render(true);
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => fitTree(false), 120);
  });

  render();
  requestAnimationFrame(() => fitTree(false));
}

if (document.getElementById("family-tree")) initFamilyTree();
