(function () {
  const sourceDatas = [
    { vendor: "华为", data: window.HUAWEI_PRODUCTS_DATA },
    { vendor: "华三", data: window.H3C_PRODUCTS_DATA },
  ].filter((source) => source.data && Array.isArray(source.data.records));

  const data = combineSources(sourceDatas);
  const records = data.records.map((record) => {
    const portProfile = analyzePorts(record);
    const heightU = extractHeightU(record);
    const enhanced = {
      ...record,
      _heightU: heightU,
      _portProfile: portProfile,
      _portTotal: portProfile.total,
      _portMaxSpeed: portProfile.maxSpeed,
      _portSpeeds: portProfile.speeds,
      _portSummary: portProfile.summary,
    };
    return {
      ...enhanced,
      _text: buildSearchText(enhanced),
      _portsText: normalizeText((record.ports || []).join(" ")),
      _titleText: normalizeText(`${record.seriesTitle} ${record.listingTitle} ${record.model}`),
    };
  });

  const roleOrder = {
    "核心交换机": 0,
    "汇聚交换机": 1,
    "接入交换机": 2,
    "存储网络交换机": 3,
  };

  const quickFilters = [
    { label: "800G", terms: ["800g", "800ge"] },
    { label: "400G", terms: ["400g", "400ge"] },
    { label: "200G", terms: ["200g", "200ge"] },
    { label: "100G", terms: ["100g", "100ge"] },
    { label: "25G", terms: ["25g", "25ge"] },
    { label: "10G", terms: ["10g", "10ge"] },
    { label: "QSFP-DD", terms: ["qsfp-dd"] },
    { label: "SFP56", terms: ["sfp56"] },
    { label: "SFP28", terms: ["sfp28"] },
    { label: "RoCE", terms: ["roce"] },
    { label: "VXLAN", terms: ["vxlan"] },
    { label: "M-LAG", terms: ["m-lag"] },
    { label: "AI ECN", terms: ["ai ecn", "aiecn"] },
    { label: "PFC", terms: ["pfc"] },
    { label: "iLossless", terms: ["ilossless"] },
    { label: "NOF", terms: ["nof"] },
  ];

  const state = {
    vendor: "全部",
    role: "全部",
    quick: new Set(),
  };

  const els = {
    searchInput: document.querySelector("#searchInput"),
    minCapacity: document.querySelector("#minCapacity"),
    minForwarding: document.querySelector("#minForwarding"),
    minPorts: document.querySelector("#minPorts"),
    portSpeed: document.querySelector("#portSpeed"),
    maxHeightU: document.querySelector("#maxHeightU"),
    sortSelect: document.querySelector("#sortSelect"),
    vendorFilter: document.querySelector("#vendorFilter"),
    roleFilter: document.querySelector("#roleFilter"),
    quickFilters: document.querySelector("#quickFilters"),
    results: document.querySelector("#results"),
    emptyState: document.querySelector("#emptyState"),
    resultCount: document.querySelector("#resultCount"),
    resetButton: document.querySelector("#resetButton"),
    statSeries: document.querySelector("#statSeries"),
    statRecords: document.querySelector("#statRecords"),
    statMetrics: document.querySelector("#statMetrics"),
    statUpdated: document.querySelector("#statUpdated"),
  };

  init();

  function combineSources(sources) {
    const records = sources.flatMap((source) =>
      source.data.records.map((record) => ({
        ...record,
        vendor: normalizeVendor(record.vendor || source.vendor),
        _sourceName: source.data.sourceName || "",
        _sourceUrl: source.data.sourceUrl || "",
      })),
    );
    const generatedTimes = sources
      .map((source) => new Date(source.data.generatedAt).getTime())
      .filter((time) => Number.isFinite(time));
    return {
      generatedAt: generatedTimes.length ? new Date(Math.max(...generatedTimes)).toISOString() : "",
      seriesCount: new Set(records.map((record) => `${record.vendor}:${record.url}`)).size,
      recordCount: records.length,
      sourceCount: sources.length,
      records,
    };
  }

  function init() {
    renderStats();
    renderQuickFilters();
    bindEvents();
    render();
  }

  function renderStats() {
    const metricCount = records.filter(
      (record) => record.switchingCapacityTbps !== null && record.packetForwardingMpps !== null,
    ).length;
    els.statSeries.textContent = formatInteger(data.seriesCount || new Set(records.map((r) => r.url)).size);
    els.statRecords.textContent = formatInteger(records.length);
    els.statMetrics.textContent = formatInteger(metricCount);
    els.statUpdated.textContent = formatDate(data.generatedAt);
  }

  function renderQuickFilters() {
    els.quickFilters.innerHTML = quickFilters
      .map(
        (filter, index) =>
          `<button type="button" data-filter="${index}" aria-pressed="false">${escapeHtml(filter.label)}</button>`,
      )
      .join("");
  }

  function bindEvents() {
    [
      els.searchInput,
      els.minCapacity,
      els.minForwarding,
      els.minPorts,
      els.portSpeed,
      els.maxHeightU,
      els.sortSelect,
    ].forEach((element) => {
      element.addEventListener("input", render);
      element.addEventListener("change", render);
    });

    els.vendorFilter.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-vendor]");
      if (!button) return;
      state.vendor = button.dataset.vendor;
      els.vendorFilter.querySelectorAll("button").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      render();
    });

    els.roleFilter.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-role]");
      if (!button) return;
      state.role = button.dataset.role;
      els.roleFilter.querySelectorAll("button").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      render();
    });

    els.quickFilters.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-filter]");
      if (!button) return;
      const index = Number(button.dataset.filter);
      if (state.quick.has(index)) {
        state.quick.delete(index);
        button.classList.remove("is-active");
        button.setAttribute("aria-pressed", "false");
      } else {
        state.quick.add(index);
        button.classList.add("is-active");
        button.setAttribute("aria-pressed", "true");
      }
      render();
    });

    els.results.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-copy]");
      if (!button) return;
      const text = button.dataset.copy || "";
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "已复制";
        setTimeout(() => {
          button.textContent = "复制参数";
        }, 1200);
      } catch (error) {
        button.textContent = "复制失败";
        setTimeout(() => {
          button.textContent = "复制参数";
        }, 1200);
      }
    });

    els.resetButton.addEventListener("click", () => {
      els.searchInput.value = "";
      els.minCapacity.value = "";
      els.minForwarding.value = "";
      els.minPorts.value = "";
      els.portSpeed.value = "";
      els.maxHeightU.value = "";
      els.sortSelect.value = "relevance";
      state.vendor = "全部";
      state.role = "全部";
      state.quick.clear();
      els.vendorFilter.querySelectorAll("button").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.vendor === "全部"));
      });
      els.roleFilter.querySelectorAll("button").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.role === "全部"));
      });
      els.quickFilters.querySelectorAll("button").forEach((button) => {
        button.classList.remove("is-active");
        button.setAttribute("aria-pressed", "false");
      });
      render();
    });
  }

  function render() {
    const queryTokens = tokenize(els.searchInput.value);
    const minCapacity = readNumber(els.minCapacity.value);
    const minForwarding = readNumber(els.minForwarding.value);
    const minPorts = readNumber(els.minPorts.value);
    const portSpeed = readNumber(els.portSpeed.value);
    const maxHeightU = readNumber(els.maxHeightU.value);
    const quickTerms = Array.from(state.quick).map((index) => quickFilters[index]);

    const matched = records
      .map((record) => ({
        ...record,
        _score: scoreRecord(record, queryTokens, quickTerms),
      }))
      .filter((record) => {
        if (state.vendor !== "全部" && record.vendor !== state.vendor) return false;
        if (state.role !== "全部" && record.role !== state.role) return false;
        if (minPorts !== null && record._portTotal < minPorts) return false;
        if (portSpeed !== null && !record._portSpeeds.includes(portSpeed)) return false;
        if (maxHeightU !== null && (record._heightU === null || record._heightU > maxHeightU)) return false;
        if (minCapacity !== null && !hasMetricAtLeast(record, "capacity", minCapacity)) return false;
        if (minForwarding !== null && !hasMetricAtLeast(record, "forwarding", minForwarding)) return false;
        if (!queryTokens.every((token) => tokenMatches(record._text, token))) return false;
        if (!quickTerms.every((filter) => filter.terms.some((term) => record._text.includes(term)))) return false;
        return true;
      });

    sortRecords(matched, els.sortSelect.value, { minCapacity, minForwarding, minPorts, portSpeed, maxHeightU });

    els.resultCount.textContent = `${formatInteger(matched.length)} 个型号`;
    els.emptyState.hidden = matched.length > 0;
    els.results.innerHTML = matched.map(renderCard).join("");
  }

  function sortRecords(items, mode, thresholds) {
    const byRole = (a, b) => (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99);
    const byThresholdFit = (a, b) => thresholdDistance(a, thresholds) - thresholdDistance(b, thresholds);
    const hasThreshold = Object.values(thresholds).some((value) => value !== null);
    if (mode === "capacity") {
      items.sort((a, b) => metricMax(b, "capacity") - metricMax(a, "capacity") || byRole(a, b));
      return;
    }
    if (mode === "forwarding") {
      items.sort((a, b) => metricMax(b, "forwarding") - metricMax(a, "forwarding") || byRole(a, b));
      return;
    }
    if (mode === "ports") {
      items.sort((a, b) => b._portTotal - a._portTotal || byRole(a, b));
      return;
    }
    if (mode === "height") {
      items.sort(
        (a, b) =>
          (a._heightU ?? Number.POSITIVE_INFINITY) - (b._heightU ?? Number.POSITIVE_INFINITY) ||
          byRole(a, b),
      );
      return;
    }
    if (mode === "model") {
      items.sort((a, b) => a.model.localeCompare(b.model, "en") || byRole(a, b));
      return;
    }
    items.sort(
      (a, b) =>
        b._score - a._score ||
        (hasThreshold ? byThresholdFit(a, b) : 0) ||
        byRole(a, b) ||
        (hasThreshold
          ? metricPrimary(a, "capacity", Number.POSITIVE_INFINITY) -
            metricPrimary(b, "capacity", Number.POSITIVE_INFINITY)
          : hasPerformance(b) - hasPerformance(a) || b._portTotal - a._portTotal) ||
        a.model.localeCompare(b.model, "en"),
    );
  }

  function hasPerformance(record) {
    return metricValues(record, "capacity").length && metricValues(record, "forwarding").length ? 1 : 0;
  }

  function thresholdDistance(record, thresholds) {
    let active = false;
    let distance = 0;
    if (thresholds.minCapacity !== null) {
      active = true;
      const fit = closestMetricAtLeast(record, "capacity", thresholds.minCapacity);
      if (fit === null) return Number.POSITIVE_INFINITY;
      distance += (fit - thresholds.minCapacity) / Math.max(thresholds.minCapacity, 1);
    }
    if (thresholds.minForwarding !== null) {
      active = true;
      const fit = closestMetricAtLeast(record, "forwarding", thresholds.minForwarding);
      if (fit === null) return Number.POSITIVE_INFINITY;
      distance += (fit - thresholds.minForwarding) / Math.max(thresholds.minForwarding, 1);
    }
    if (thresholds.minPorts !== null) {
      active = true;
      distance += (record._portTotal - thresholds.minPorts) / Math.max(thresholds.minPorts, 1);
    }
    if (thresholds.portSpeed !== null) {
      active = true;
      const speedFit = Math.min(...record._portSpeeds.filter((speed) => speed >= thresholds.portSpeed));
      if (!Number.isFinite(speedFit)) return Number.POSITIVE_INFINITY;
      distance += (speedFit - thresholds.portSpeed) / Math.max(thresholds.portSpeed, 1);
    }
    if (thresholds.maxHeightU !== null) {
      active = true;
      if (record._heightU === null || record._heightU > thresholds.maxHeightU) return Number.POSITIVE_INFINITY;
      distance += Math.max(thresholds.maxHeightU - record._heightU, 0) / Math.max(thresholds.maxHeightU, 1);
    }
    return active ? distance : 0;
  }

  function metricValues(record, type) {
    const values =
      type === "capacity"
        ? record.switchingCapacityValuesTbps
        : record.packetForwardingValuesMpps;
    if (Array.isArray(values) && values.length) return values.filter((value) => Number.isFinite(value));
    const fallback = type === "capacity" ? record.switchingCapacityTbps : record.packetForwardingMpps;
    return Number.isFinite(fallback) ? [fallback] : [];
  }

  function hasMetricAtLeast(record, type, threshold) {
    return metricValues(record, type).some((value) => value >= threshold);
  }

  function closestMetricAtLeast(record, type, threshold) {
    const matches = metricValues(record, type).filter((value) => value >= threshold);
    return matches.length ? Math.min(...matches) : null;
  }

  function metricPrimary(record, type, fallback = -1) {
    const values = metricValues(record, type);
    return values.length ? values[0] : fallback;
  }

  function metricMax(record, type) {
    const values = metricValues(record, type);
    return values.length ? Math.max(...values) : -1;
  }

  function analyzePorts(record) {
    const specs = record.specs || {};
    const specEntries = Object.entries(specs);
    const explicitPorts = (record.ports || []).map((line) => {
      const [label, ...rest] = String(line).split(":");
      return [label, rest.join(":")];
    });
    const uniqueEntries = [];
    const seenEntries = new Set();
    for (const [label, value] of [...specEntries, ...explicitPorts]) {
      const cleanLabel = String(label || "").trim();
      const cleanValue = String(value || "").trim();
      const key = `${cleanLabel}::${cleanValue}`;
      if (seenEntries.has(key)) continue;
      seenEntries.add(key);
      uniqueEntries.push([cleanLabel, cleanValue]);
    }
    const lines = uniqueEntries
      .map(([label, value]) => parsePortLine(label, value))
      .filter(Boolean);
    const speeds = Array.from(new Set(lines.flatMap((line) => line.speeds))).sort((a, b) => a - b);
    const total = lines.reduce((sum, line) => sum + line.count, 0);
    const summary = lines
      .sort((a, b) => b.maxSpeed - a.maxSpeed || b.count - a.count)
      .slice(0, 4)
      .map((line) => line.brief);
    return {
      lines,
      total,
      speeds,
      maxSpeed: speeds.length ? Math.max(...speeds) : null,
      summary,
    };
  }

  function parsePortLine(label, value) {
    const key = String(label || "");
    const rawValue = String(value || "");
    const joined = `${key} ${rawValue}`;
    if (/(功耗|电源|供电|可靠|安全|智能运维|数据中心特性|缓存|风扇|尺寸|重量)/i.test(key)) {
      return null;
    }
    if (/(接口板|槽位|交换网|主控|网板)/i.test(key)) {
      return null;
    }
    const keyLooksPort = /(端口|接口|以太网口|固定端口|固化端口)/i.test(key);
    const valueLooksPort = /^\s*(?:支持[^：:；;。]*[:：；;])?\s*(?:[•·-]\s*)?\d+\s*(?:x|×|\*)\s*\d/i.test(rawValue);
    if (!keyLooksPort && !valueLooksPort) {
      return null;
    }
    if (!/(端口|接口|以太网口|SFP|QSFP|OSFP|Base[- ]?T|GE|G口|固定端口|固化端口)/i.test(joined)) {
      return null;
    }
    if (/(Console|USB|管理|带外|1PPS|TOD|SMB|时钟|串行|槽位|端口聚合|端口特性|端口镜像|端口隔离|安全|限速)/i.test(joined)) {
      return null;
    }
    if (/^\s*[-/]\s*$/.test(rawValue) || /:\s*-\s*$/.test(joined)) {
      return null;
    }

    const speeds = extractSpeeds(joined);
    const count = extractPortCount(rawValue);
    if (!speeds.length || count <= 0) {
      return null;
    }

    const media = extractMedia(joined);
    const segments = extractPortSegments(joined);
    const speedText = speeds.map(formatSpeed).join("/");
    const brief = segments.length
      ? segments
          .slice(0, 4)
          .map((segment) => `${segment.count} x ${segment.speeds.map(formatSpeed).join("/")}`)
          .join(" + ")
      : `${count} x ${speedText}${media ? ` ${media}` : ""}`;
    return {
      label: key,
      value: rawValue,
      count,
      speeds,
      maxSpeed: Math.max(...speeds),
      brief,
    };
  }

  function extractPortCount(value) {
    const text = String(value || "")
      .replace(/,/g, "")
      .replace(/×/g, "x")
      .replace(/＋/g, "+");
    let matches = Array.from(text.matchAll(/(\d+)\s*个[^，；。]*?业务接口/g)).map((match) => Number(match[1]));
    if (matches.length) return matches.reduce((sum, number) => sum + number, 0);
    if (/(IPC接口|SFI接口)/i.test(text) && !/业务接口/.test(text)) return 0;
    const chunks = text.split(/\s*(?:\+|，|,|；|;|。|•|\s+和\s+)\s*/).filter(Boolean);
    let cabledCount = 0;
    for (const chunk of chunks) {
      const chunkCounts = Array.from(chunk.matchAll(/(\d+)\s*(?:x|\*)\s*\d/gi)).map((match) => Number(match[1]));
      if (chunkCounts.length) {
        cabledCount += Math.max(...chunkCounts);
      }
    }
    if (cabledCount > 0) return cabledCount;
    matches = Array.from(text.matchAll(/(\d+)\s*个/g)).map((match) => Number(match[1]));
    return matches.reduce((sum, number) => sum + number, 0);
  }

  function extractPortSegments(text) {
    const segments = [];
    const normalized = String(text || "").replace(/×/g, "x").replace(/\*/g, "x");
    const matches = normalized.matchAll(/(\d+)\s*x\s*((?:\d+(?:\.\d+)?\s*\/\s*)*\d+(?:\.\d+)?)\s*(?:G|GE|GbE)/gi);
    for (const match of matches) {
      const count = Number(match[1]);
      const speeds = match[2]
        .split("/")
        .map((part) => Number(part.trim()))
        .filter((number) => Number.isFinite(number) && number > 0);
      if (count > 0 && speeds.length) {
        segments.push({ count, speeds });
      }
    }
    return segments;
  }

  function extractSpeeds(text) {
    const speeds = new Set();
    const speedGroups = String(text || "").matchAll(/((?:\d+(?:\.\d+)?\/)*\d+(?:\.\d+)?)\s*(?:G|GE|GbE)/gi);
    for (const match of speedGroups) {
      match[1].split("/").forEach((part) => {
        const value = Number(part);
        if (Number.isFinite(value) && value > 0) speeds.add(value);
      });
    }
    if (/1000BASE/i.test(text)) speeds.add(1);
    return Array.from(speeds).sort((a, b) => a - b);
  }

  function extractMedia(text) {
    const normalized = String(text || "").toUpperCase().replace(/QSFPDD/g, "QSFP-DD");
    const mediaOrder = ["OSFP800", "OSFP", "QSFP-DD800", "QSFP-DD", "QSFP112", "QSFP56", "QSFP28", "QSFP+", "SFP56", "SFP28", "SFP+", "BASE-T"];
    return mediaOrder.find((item) => normalized.includes(item)) || "";
  }

  function extractHeightU(record) {
    const specs = record.specs || {};
    for (const [label, value] of Object.entries(specs)) {
      const text = `${label} ${value}`;
      if (!/尺寸|外形|外型|高度|H x W x D|宽.*深.*高/i.test(text)) continue;
      const explicit = text.match(/(\d+(?:\.\d+)?)\s*(?:RU|U)\b/i);
      if (explicit) return Number(explicit[1]);
    }
    for (const [label, value] of Object.entries(specs)) {
      const key = String(label || "");
      const text = String(value || "");
      if (!/尺寸|外形|外型|H x W x D|宽.*深.*高/i.test(`${key} ${text}`)) continue;
      const numbers = text.match(/\d+(?:\.\d+)?/g);
      if (!numbers || numbers.length < 3) continue;
      const dims = numbers.slice(0, 3).map(Number);
      const heightMm = /H\s*x\s*W\s*x\s*D|高\s*[x×]\s*宽\s*[x×]\s*深/i.test(key) ? dims[0] : dims[2];
      if (!Number.isFinite(heightMm) || heightMm <= 0) continue;
      const u = heightMm / 44.45;
      return Math.max(1, Math.round(u));
    }
    return null;
  }

  function formatSpeed(value) {
    return `${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}G`;
  }

  function renderCard(record) {
    const image = record.imageUrl
      ? `<img class="thumb" src="${escapeAttr(record.imageUrl)}" alt="${escapeAttr(record.model)}" loading="lazy" onerror="this.replaceWith(makeThumbFallback('${escapeAttr(record.model)}'))" />`
      : `<div class="thumb thumb-placeholder">${escapeHtml(shortModel(record.model))}</div>`;
    const portSummary = record._portSummary.length
      ? record._portSummary
      : (record.ports || []).slice(0, 4).map((item) => String(item).replace(/^业务端口:\s*/, ""));
    const ports = renderChips(portSummary, "", 8);
    const features = renderChips(record.features || [], "feature", 10);
    const specs = renderSpecs(record);
    const oneLine = buildOneLine(record);
    const specLink = record.specUrl || record.brochureUrl || "";

    return `
      <article class="result-card">
        <div class="media-col">${image}</div>
        <div class="result-body">
          <div class="device-head">
            <div class="card-top">
              <span class="vendor-tag ${record.vendor === "华三" ? "h3c" : "huawei"}">${escapeHtml(record.vendor)}</span>
              <span class="tag">${escapeHtml(trimRole(record.role))}</span>
              <span class="group">${escapeHtml(record.scenario || record.seriesGroup || record.listingTitle)}</span>
            </div>
            <div class="result-actions">
              <button type="button" class="copy-button" data-copy="${escapeAttr(oneLine)}">复制参数</button>
              <a class="primary" href="${escapeAttr(record.url)}" target="_blank" rel="noreferrer">官网</a>
              ${specLink ? `<a href="${escapeAttr(specLink)}" target="_blank" rel="noreferrer">资料</a>` : ""}
            </div>
          </div>

          <div class="result-title">
            <div class="model">${escapeHtml(record.model)}</div>
            <h3>${escapeHtml(record.seriesTitle)}</h3>
          </div>

          <div class="fact-grid">
            ${renderFact("端口数量", record._portTotal ? `${record._portTotal} 个` : "按板卡配置", portSummary.join("；"))}
            ${renderFact("端口带宽", record._portMaxSpeed ? `${formatSpeed(record._portMaxSpeed)}` : "未列明", record._portSpeeds.map(formatSpeed).join(" / ") || "官网未列入该型号行")}
            ${renderFact("设备高度", record._heightU ? `${formatNumber(record._heightU)}U` : "未知", getDimensionText(record))}
            ${renderFact("交换容量", renderMetricDisplay(metricValues(record, "capacity"), "Tbps"), record.switchingCapacityRaw || "官网未列入该型号行")}
            ${renderFact("包转发率", renderMetricDisplay(metricValues(record, "forwarding"), "Mpps"), record.packetForwardingRaw || "官网未列入该型号行")}
          </div>

          <div class="write-line">${escapeHtml(oneLine)}</div>

          <div class="port-block">
            <span>业务端口</span>
            <div class="chips">${ports || '<span class="muted">按板卡/资料配置</span>'}</div>
          </div>

          <div class="feature-block">
            <span>特性标签</span>
            <div class="chips">${features || '<span class="muted">未命中特性标签</span>'}</div>
          </div>

          <details>
            <summary>规格字段</summary>
            ${specs}
          </details>
        </div>
      </article>
    `;
  }

  function renderFact(label, value, hint) {
    return `
      <div class="fact">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(hint || "")}</small>
      </div>
    `;
  }

  function renderMetricDisplay(values, unit) {
    const validValues = Array.isArray(values) ? values.filter((value) => Number.isFinite(value)) : [];
    return validValues.length
      ? `${validValues.map((value) => formatNumber(value)).join(" / ")} ${unit}`
      : "未知";
  }

  function buildOneLine(record) {
    return [
      record.vendor,
      record.model,
      record._heightU ? `${formatNumber(record._heightU)}U` : "高度未列明",
      record._portSummary.length ? `端口：${record._portSummary.join("，")}` : "端口按板卡/模块配置",
      `交换容量：${renderMetricDisplay(metricValues(record, "capacity"), "Tbps")}`,
      `包转发率：${renderMetricDisplay(metricValues(record, "forwarding"), "Mpps")}`,
    ].join("；");
  }

  function getDimensionText(record) {
    const specs = record.specs || {};
    for (const [label, value] of Object.entries(specs)) {
      if (/尺寸|外形|外型|高度|H x W x D|宽.*深.*高/i.test(`${label} ${value}`)) {
        return `${label}: ${value}`;
      }
    }
    return "官网未列入该型号行";
  }

  function renderMetric(label, values, unit, rawLabel, rawValue) {
    const validValues = Array.isArray(values) ? values.filter((value) => Number.isFinite(value)) : [];
    const display = validValues.length
      ? `${validValues.map((value) => formatNumber(value)).join(" / ")} ${unit}`
      : "未知";
    const raw = rawValue ? `${rawLabel || label}: ${rawValue}` : "官网未列入该型号行";
    return `
      <div class="metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(display)}</strong>
        <small>${escapeHtml(raw)}</small>
      </div>
    `;
  }

  function renderChips(items, extraClass, limit) {
    const visible = items.slice(0, limit);
    const chips = visible
      .map((item) => `<span class="chip ${extraClass}">${escapeHtml(item)}</span>`)
      .join("");
    const more = items.length > limit ? `<span class="chip">+${items.length - limit}</span>` : "";
    return chips + more;
  }

  function renderSpecs(record) {
    const entries = Object.entries(record.specs || {})
      .filter(([key]) => /交换容量|包转发|端口|接口|Console|USB|管理口|槽位|缓存|安全|可靠|智能运维|数据中心特性|功耗|电源|风扇|尺寸|重量/i.test(key))
      .slice(0, 30);
    if (!entries.length) {
      return '<p class="muted">没有可展示的规格字段</p>';
    }
    return `
      <table class="spec-table">
        <tbody>
          ${entries
            .map(
              ([key, value]) =>
                `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  function scoreRecord(record, queryTokens, quickTerms) {
    let score = 0;
    for (const token of queryTokens) {
      for (const alias of tokenAliases(token)) {
        if (record.model.toLowerCase().includes(alias)) score += 45;
        if (record._portsText.includes(alias)) score += 24;
        if (record._titleText.includes(alias)) score += 16;
        if (record._text.includes(alias)) score += 5;
      }
    }
    for (const filter of quickTerms) {
      if (filter.terms.some((term) => record._portsText.includes(term))) score += 12;
      if (filter.terms.some((term) => record._text.includes(term))) score += 4;
    }
    return score;
  }

  function buildSearchText(record) {
    const specs = Object.entries(record.specs || {})
      .map(([key, value]) => `${key} ${value}`)
      .join(" ");
    const portText = [(record.ports || []).join(" "), specs].join(" ");
    return normalizeText(
      [
        record.vendor,
        record.vendor === "华三" ? "h3c 新华三" : "huawei 华为",
        record.role,
        record.scenario,
        record.seriesGroup,
        record.seriesTitle,
        record.listingTitle,
        record.model,
        record.description,
        (record.ports || []).join(" "),
        buildPortAliases(portText),
        (record._portSummary || []).join(" "),
        record._portTotal ? `${record._portTotal}口 ${record._portTotal}个端口` : "",
        record._heightU ? `${record._heightU}u ${record._heightU}U` : "",
        (record._portSpeeds || []).map(formatSpeed).join(" "),
        (record.features || []).join(" "),
        record.switchingCapacityRaw,
        record.packetForwardingRaw,
        specs,
      ].join(" "),
    );
  }

  function buildPortAliases(value) {
    const aliases = [];
    const normalized = String(value || "").replace(/×/g, "x").replace(/\*/g, "x");
    const matches = normalized.matchAll(/(\d+)\s*x\s*((?:\d+(?:\.\d+)?\s*\/\s*)*\d+(?:\.\d+)?)\s*(?:G|GE|GbE)/gi);
    for (const match of matches) {
      const count = Number(match[1]);
      const speeds = match[2]
        .split("/")
        .map((part) => Number(part.trim()))
        .filter((number) => Number.isFinite(number) && number > 0);
      for (const speed of speeds) {
        aliases.push(`${count}口${speed}g`, `${count}口${speed}ge`, `${count}x${speed}g`, `${count}x${speed}ge`);
      }
    }
    return aliases.join(" ");
  }

  function tokenize(value) {
    return normalizeText(value)
      .split(/[\s,，;；]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function tokenAliases(token) {
    const aliases = new Set([token]);
    const geMatch = token.match(/^(\d+)ge$/i);
    const gMatch = token.match(/^(\d+)g$/i);
    if (geMatch) aliases.add(`${geMatch[1]}g`);
    if (gMatch) aliases.add(`${gMatch[1]}ge`);
    const portSpeedMatch = token.match(/^(\d+)(?:口|x)(\d+(?:\.\d+)?)(g|ge)$/i);
    if (portSpeedMatch) {
      aliases.add(`${portSpeedMatch[1]}口${portSpeedMatch[2]}g`);
      aliases.add(`${portSpeedMatch[1]}口${portSpeedMatch[2]}ge`);
      aliases.add(`${portSpeedMatch[1]}x${portSpeedMatch[2]}g`);
      aliases.add(`${portSpeedMatch[1]}x${portSpeedMatch[2]}ge`);
    }
    return Array.from(aliases);
  }

  function tokenMatches(text, token) {
    return tokenAliases(token).some((alias) => text.includes(alias));
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/×/g, "x")
      .replace(/\s*x\s*/g, "x")
      .replace(/\s+/g, " ")
      .trim();
  }

  function readNumber(value) {
    if (value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.slice(0, 10);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  function formatNumber(value) {
    if (value === null || value === undefined) return "未知";
    const decimals = value < 10 ? 2 : value < 100 ? 1 : 0;
    return Number(value).toLocaleString("zh-CN", {
      maximumFractionDigits: decimals,
    });
  }

  function formatInteger(value) {
    return Number(value || 0).toLocaleString("zh-CN");
  }

  function trimRole(role) {
    return String(role || "").replace("交换机", "");
  }

  function normalizeVendor(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("h3c") || text.includes("华三") || text.includes("新华三")) return "华三";
    if (text.includes("huawei") || text.includes("华为")) return "华为";
    return value || "未知";
  }

  function shortModel(model) {
    const value = String(model || "Switch");
    return value.length > 14 ? `${value.slice(0, 14)}…` : value;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();

function makeThumbFallback(model) {
  const div = document.createElement("div");
  div.className = "thumb thumb-placeholder";
  div.textContent = String(model || "Switch").slice(0, 14);
  return div;
}
