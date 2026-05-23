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
const cardTemplate = document.getElementById("result-card-template");
const DEFAULT_HINT =
  "授权信息查询依据内网SR-P-4002《人员授权清单》。本查询结果的最终解释权归属质量安全培训部维修质量室所有。";

const summaryFields = [
  "起止日期",
  "工卡批准起止日期",
  "发放日期",
  "更换日期",
  "更换日期2",
  "遗失",
  "授权级别类",
  "授权类级别",
  "授权岗位",
  "授权项目",
  "种类",
  "编号",
  "机型/ATA章节",
  "机型",
  "授权证书号",
  "授权专业/件号",
  "授权范围",
  "执照",
  "放行经历",
  "调动收回",
  "离职收回",
  "撤销收回",
  "损坏收回",
  "印章状态",
  "备注",
];

const hiddenFields = new Set([
  "序号",
  "姓名",
  "工号",
  "部门",
  "授权状态",
  "印章状态",
  "授权转换日期",
]);

function normalize(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function displayValue(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildSummary(name, employeeId, records) {
  const firstRecord = records[0]?.fields || {};
  const personName = displayValue(firstRecord["姓名"]) || name;
  const personEmployeeId = displayValue(firstRecord["工号"]) || employeeId;
  const department = displayValue(firstRecord["部门"]);
  const sheets = [...new Set(records.map((record) => getRecordTitle(record)))];
  const head = [personName, personEmployeeId, department].filter(Boolean).map(escapeHtml).join(" / ");
  summary.innerHTML = `
    <strong>${head}</strong>
    ${escapeHtml(sheets.join("、"))}
  `;
  summary.classList.remove("hidden");
}

function buildFieldEntries(fields) {
  return Object.entries(fields).filter(([label, value]) => {
    const text = displayValue(value);
    return text !== "" && text !== "/" && text !== "／" && !hiddenFields.has(label);
  });
}

function getRecordTitle(record) {
  const fields = record.fields;
  if (record.sheet === "受控印章清册") {
    return "受控印章";
  }

  return (
    fields["授权岗位"] ||
    fields["授权项目"] ||
    fields["授权级别类"] ||
    fields["授权类级别"] ||
    record.sheet ||
    "授权记录"
  );
}

function buildResultCard(record) {
  const fragment = cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".result-card");
  const title = fragment.querySelector(".result-title");
  const badge = fragment.querySelector(".status-badge");
  const grid = fragment.querySelector(".field-grid");

  const fields = record.fields;
  const status =
    (record.sheet === "受控印章清册"
      ? displayValue(fields["印章状态"])
      : displayValue(fields["授权状态"])) || "有效";
  const titleText = getRecordTitle(record);

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
  const queryText = [name, employeeId].filter(Boolean).map(escapeHtml).join(" / ");

  if (!records.length) {
    summary.innerHTML = `<strong>未查询到结果</strong>请确认输入信息是否准确，当前查询：${queryText}`;
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
  let records = state.payload.records;

  if (normalizedName) {
    records = records.filter((record) => normalize(record.fields["姓名"]) === normalizedName);
  }
  if (normalizedEmployeeId) {
    records = records.filter((record) => normalize(record.fields["工号"]) === normalizedEmployeeId);
  }

  if (normalizedName && !normalizedEmployeeId) {
    const employeeIds = [...new Set(records.map((record) => displayValue(record.fields["工号"])).filter(Boolean))];
    if (employeeIds.length > 1) {
      return {
        records: [],
        error: "查询到重名人员，请继续输入工号后再查询。",
      };
    }
  }

  return { records, error: "" };
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

  if (!name && !employeeId) {
    setQueryHint("请至少输入姓名或工号。", true);
    summary.classList.add("hidden");
    results.classList.add("hidden");
    return;
  }

  const { records: matched, error } = searchRecords(name, employeeId);
  if (error) {
    setQueryHint(error, true);
    summary.classList.add("hidden");
    results.classList.add("hidden");
    syncQueryToUrl(name, employeeId);
    return;
  }

  setQueryHint(DEFAULT_HINT);
  syncQueryToUrl(name, employeeId);
  renderRecords(name, employeeId, matched);
}

function handleReset() {
  form.reset();
  summary.classList.add("hidden");
  results.classList.add("hidden");
  setQueryHint(DEFAULT_HINT);
  syncQueryToUrl("", "");
}

async function bootstrap() {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`数据加载失败: ${response.status}`);
  }

  state.payload = await response.json();
  const params = new URLSearchParams(window.location.search);
  const name = params.get("name") || "";
  const employeeId = params.get("employeeId") || "";
  if (name) {
    nameInput.value = name;
  }
  if (employeeId) {
    employeeIdInput.value = employeeId;
  }
  if (name || employeeId) {
    const { records, error } = searchRecords(name, employeeId);
    if (error) {
      setQueryHint(error, true);
    } else {
      renderRecords(name, employeeId, records);
    }
  }
}

form.addEventListener("submit", handleSearch);
resetButton.addEventListener("click", handleReset);

bootstrap().catch((error) => {
  summary.innerHTML = `<strong>页面初始化失败</strong>${escapeHtml(error.message)}`;
  summary.classList.remove("hidden");
  setQueryHint("请检查数据文件是否存在。", true);
});
