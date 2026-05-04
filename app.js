const DATA_URL = "./data/authorizations.json";

const state = {
  payload: null,
};

const form = document.getElementById("search-form");
const nameInput = document.getElementById("name");
const employeeIdInput = document.getElementById("employeeId");
const resetButton = document.getElementById("reset-btn");
const summary = document.getElementById("summary");
const results = document.getElementById("results");
const queryHint = document.getElementById("query-hint");
const datasetMeta = document.getElementById("dataset-meta");
const cardTemplate = document.getElementById("result-card-template");

const summaryFields = [
  "部门",
  "授权级别类",
  "授权类级别",
  "授权岗位",
  "授权项目",
  "机型/ATA章节",
  "机型",
  "授权范围",
  "授权证书号",
  "起止日期",
  "工卡批准起止日期",
  "授权状态",
  "备注",
  "执照",
];

function normalize(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setMeta(payload) {
  const generatedAt = new Date(payload.metadata.generatedAt).toLocaleString("zh-CN", {
    hour12: false,
  });

  const items = [
    ["来源文件", payload.metadata.sourceFile],
    ["记录总数", `${payload.metadata.recordCount} 条`],
    ["人员数量", `${payload.metadata.personCount} 人`],
    ["更新时间", generatedAt],
  ];

  datasetMeta.innerHTML = items
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
}

function buildSummary(name, employeeId, records) {
  const sheets = [...new Set(records.map((record) => record.sheet))];
  summary.innerHTML = `
    <strong>${escapeHtml(name)} / ${escapeHtml(employeeId)}</strong>
    命中 ${records.length} 条记录，分布于 ${sheets.length} 个 sheet：${escapeHtml(sheets.join("、"))}
  `;
  summary.classList.remove("hidden");
}

function buildFieldEntries(fields) {
  return Object.entries(fields).filter(([, value]) => String(value || "").trim() !== "");
}

function buildResultCard(record) {
  const fragment = cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".result-card");
  const sheet = fragment.querySelector(".result-sheet");
  const title = fragment.querySelector(".result-title");
  const badge = fragment.querySelector(".status-badge");
  const grid = fragment.querySelector(".field-grid");

  const fields = record.fields;
  const status = fields["授权状态"] || "未标注";
  const titleText =
    fields["授权岗位"] ||
    fields["授权项目"] ||
    fields["授权级别类"] ||
    fields["授权类级别"] ||
    "授权记录";

  sheet.textContent = `${record.sheet} · 第 ${record.rowNumber} 行`;
  title.textContent = titleText;
  badge.textContent = status;
  if (status !== "有效") {
    badge.classList.add("warn");
  }

  const entries = buildFieldEntries(fields).sort((a, b) => {
    const aIndex = summaryFields.indexOf(a[0]);
    const bIndex = summaryFields.indexOf(b[0]);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  for (const [label, value] of entries) {
    const item = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    item.append(dt, dd);
    grid.append(item);
  }

  return card;
}

function renderRecords(name, employeeId, records) {
  results.innerHTML = "";

  if (!records.length) {
    summary.innerHTML = `<strong>未查询到结果</strong>请确认姓名与工号是否同时准确，当前查询：${escapeHtml(
      name
    )} / ${escapeHtml(employeeId)}`;
    summary.classList.remove("hidden");
    results.classList.add("hidden");
    return;
  }

  buildSummary(name, employeeId, records);
  const cards = records.map((record) => buildResultCard(record));
  results.append(...cards);
  results.classList.remove("hidden");
}

function searchRecords(name, employeeId) {
  const normalizedName = normalize(name);
  const normalizedEmployeeId = normalize(employeeId);

  return state.payload.records.filter((record) => {
    return (
      normalize(record.fields["姓名"]) === normalizedName &&
      normalize(record.fields["工号"]) === normalizedEmployeeId
    );
  });
}

function setQueryHint(message, isError = false) {
  queryHint.textContent = message;
  queryHint.style.color = isError ? "var(--warn)" : "";
}

function syncQueryToUrl(name, employeeId) {
  const url = new URL(window.location.href);
  if (name) {
    url.searchParams.set("name", name);
  } else {
    url.searchParams.delete("name");
  }
  if (employeeId) {
    url.searchParams.set("employeeId", employeeId);
  } else {
    url.searchParams.delete("employeeId");
  }
  window.history.replaceState({}, "", url);
}

function handleSearch(event) {
  event.preventDefault();
  const name = nameInput.value.trim();
  const employeeId = employeeIdInput.value.trim();

  if (!name || !employeeId) {
    setQueryHint("请同时输入姓名和工号。", true);
    summary.classList.add("hidden");
    results.classList.add("hidden");
    return;
  }

  const matched = searchRecords(name, employeeId);
  setQueryHint("查询结果仅返回姓名与工号同时匹配的记录。");
  syncQueryToUrl(name, employeeId);
  renderRecords(name, employeeId, matched);
}

function handleReset() {
  form.reset();
  summary.classList.add("hidden");
  results.classList.add("hidden");
  setQueryHint("需同时输入姓名和工号；查询结果仅返回两者同时匹配的记录。");
  syncQueryToUrl("", "");
}

async function bootstrap() {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`数据加载失败: ${response.status}`);
  }

  state.payload = await response.json();
  setMeta(state.payload);

  const params = new URLSearchParams(window.location.search);
  const name = params.get("name") || "";
  const employeeId = params.get("employeeId") || "";
  if (name) {
    nameInput.value = name;
  }
  if (employeeId) {
    employeeIdInput.value = employeeId;
  }
  if (name && employeeId) {
    renderRecords(name, employeeId, searchRecords(name, employeeId));
  }
}

form.addEventListener("submit", handleSearch);
resetButton.addEventListener("click", handleReset);

bootstrap().catch((error) => {
  summary.innerHTML = `<strong>页面初始化失败</strong>${escapeHtml(error.message)}`;
  summary.classList.remove("hidden");
  setQueryHint("请检查数据文件是否存在。", true);
});
