(() => {
  const body = document.body;
  const root = body.dataset.root || "";
  const sidebar = document.querySelector("#sidebar");
  const scrim = document.querySelector("#sidebarScrim");
  const menuButton = document.querySelector("#menuButton");
  const dialog = document.querySelector("#searchDialog");
  const input = document.querySelector("#globalSearch");
  const results = document.querySelector("#searchResults");
  let searchIndex = null;

  function setSidebar(open) {
    sidebar?.classList.toggle("is-open", open);
    scrim?.classList.toggle("is-open", open);
    body.classList.toggle("nav-open", open);
  }
  menuButton?.addEventListener("click", () => setSidebar(!sidebar.classList.contains("is-open")));
  scrim?.addEventListener("click", () => setSidebar(false));

  async function ensureIndex() {
    if (!searchIndex) searchIndex = await fetch(`${root}assets/search-index.json`).then((response) => response.json());
    return searchIndex;
  }
  async function openSearch() {
    if (!dialog.open) dialog.showModal();
    await ensureIndex();
    requestAnimationFrame(() => input.focus());
  }
  document.querySelectorAll("[data-search-open]").forEach((button) => button.addEventListener("click", openSearch));
  document.querySelector("[data-search-close]")?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { event.preventDefault(); openSearch(); }
    if (event.key === "Escape") setSidebar(false);
  });

  const esc = (value) => String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  input?.addEventListener("input", async () => {
    const query = input.value.trim().toLowerCase();
    if (!query) { results.innerHTML = `<p class="search-hint">输入关键词开始搜索</p>`; return; }
    const index = await ensureIndex();
    const tokens = query.split(/\s+/).filter(Boolean);
    const matches = index.map((item) => {
      const title = item.title.toLowerCase(); const text = item.text.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (title.includes(token) ? 8 : 0) + (text.includes(token) ? 2 : 0), 0);
      return { ...item, score };
    }).filter((item) => item.score).sort((a,b) => b.score-a.score).slice(0,20);
    results.innerHTML = matches.length ? matches.map((item) => `<a href="${root}${item.url}"><small>${esc(item.typeLabel)}</small><strong>${esc(item.title)}</strong><p>${esc(item.summary)}</p></a>`).join("") : `<p class="search-hint">没有找到“${esc(query)}”</p>`;
  });

  const legacy = location.hash.match(/^#\/(concept|framework|case|logic)\/([^/]+)/);
  if (legacy) {
    const dir = { concept:"concepts", framework:"frameworks", case:"cases", logic:"viewpoints" }[legacy[1]];
    location.replace(`${root}${dir}/${legacy[2].toLowerCase()}/`);
  }

  async function initGraph() {
    const stage = document.querySelector("[data-graph]");
    if (!stage) return;
    const svgElement = document.querySelector("#knowledgeGraph");
    const tooltip = document.querySelector("#graphTooltip");
    const count = document.querySelector("#graphCount");
    const filter = document.querySelector("#graphType");
    const reset = document.querySelector("#graphReset");
    if (!window.d3) { stage.innerHTML = `<p class="graph-error">图谱组件未能加载，请检查网络连接。其它页面仍可正常使用。</p>`; return; }
    const graph = await fetch(`${root}assets/graph-data.json`).then((response) => response.json());
    const d3 = window.d3;
    const width = Math.max(720, stage.clientWidth); const height = Math.max(620, stage.clientHeight);
    const svg = d3.select(svgElement).attr("viewBox", [0,0,width,height]);
    const viewport = svg.append("g");
    const zoom = d3.zoom().scaleExtent([0.25,3]).on("zoom", (event) => viewport.attr("transform", event.transform));
    svg.call(zoom);
    let simulation;

    function render(type = "") {
      viewport.selectAll("*").remove(); simulation?.stop();
      const baseNodes = type ? graph.nodes.filter((node) => node.type === type) : graph.nodes;
      const baseIds = new Set(baseNodes.map((node) => node.id));
      const visibleIds = new Set(baseIds);
      if (type) graph.edges.forEach((edge) => { if (baseIds.has(edge.source)) visibleIds.add(edge.target); if (baseIds.has(edge.target)) visibleIds.add(edge.source); });
      const nodes = graph.nodes.filter((node) => visibleIds.has(node.id)).map((node) => ({...node}));
      const ids = new Set(nodes.map((node) => node.id));
      const links = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => ({...edge}));
      count.textContent = `${nodes.length} 个节点 · ${links.length} 条关系`;
      const link = viewport.append("g").attr("class","graph-links").selectAll("line").data(links).join("line");
      const node = viewport.append("g").attr("class","graph-nodes").selectAll("circle").data(nodes).join("circle")
        .attr("r", (d) => d.type === "viewpoint" ? 8 : d.type === "framework" ? 6 : 4)
        .attr("fill", (d) => d.color).call(d3.drag().on("start", dragStarted).on("drag", dragged).on("end", dragEnded))
        .on("mouseenter", (event,d) => { tooltip.innerHTML = `<small>${d.type}</small><strong>${esc(d.label)}</strong><p>${esc(d.summary)}</p>`; tooltip.classList.add("show"); })
        .on("mousemove", (event) => { const rect=stage.getBoundingClientRect(); tooltip.style.left=`${event.clientX-rect.left+16}px`; tooltip.style.top=`${event.clientY-rect.top+16}px`; })
        .on("mouseleave", () => tooltip.classList.remove("show"))
        .on("click", (_,d) => { location.href = `${root}${d.url}`; });
      const labels = viewport.append("g").attr("class","graph-labels").selectAll("text").data(nodes.filter((d) => d.type === "viewpoint" || d.type === "framework")).join("text").text((d) => d.label).attr("font-size", (d) => d.type === "viewpoint" ? 10 : 8);
      simulation = d3.forceSimulation(nodes).force("link",d3.forceLink(links).id((d)=>d.id).distance((d)=>d.source.type === "viewpoint" ? 72 : 48).strength(.25)).force("charge",d3.forceManyBody().strength((d)=>d.type === "viewpoint" ? -180 : -55)).force("center",d3.forceCenter(width/2,height/2)).force("collision",d3.forceCollide().radius((d)=>d.type === "viewpoint" ? 20 : 10)).on("tick",()=>{ link.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y); node.attr("cx",d=>d.x).attr("cy",d=>d.y); labels.attr("x",d=>d.x+10).attr("y",d=>d.y+3); });
      function dragStarted(event,d){ if(!event.active)simulation.alphaTarget(.3).restart();d.fx=d.x;d.fy=d.y; }
      function dragged(event,d){d.fx=event.x;d.fy=event.y;}
      function dragEnded(event,d){if(!event.active)simulation.alphaTarget(0);d.fx=null;d.fy=null;}
    }
    filter.addEventListener("change", () => render(filter.value));
    reset.addEventListener("click", () => { filter.value=""; render(""); svg.transition().duration(350).call(zoom.transform,d3.zoomIdentity); });
    render();
  }
  initGraph().catch((error) => { const stage=document.querySelector("[data-graph]"); if(stage)stage.innerHTML=`<p class="graph-error">图谱数据加载失败：${esc(error.message)}</p>`; });
})();

