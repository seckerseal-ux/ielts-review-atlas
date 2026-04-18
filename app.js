const EXAM_CONFIG = {
  ielts: {
    label: "雅思",
    sections: {
      reading: {
        label: "阅读",
        questionTypes: [
          "Heading Matching",
          "Matching Information",
          "Matching Features",
          "Matching Sentence Endings",
          "True / False / Not Given",
          "Yes / No / Not Given",
          "Multiple Choice",
          "Summary Completion",
          "Sentence Completion",
          "Short Answer",
          "Diagram Labeling",
          "Table Completion",
        ],
        causes: [
          "段落主旨抓偏",
          "heading 关键词误导",
          "NG / FALSE 判断混淆",
          "细节和主旨混淆",
          "段落匹配回查不全",
          "原文定位句看漏",
          "逻辑转折没抓住",
          "指代关系没看清",
          "限定词范围忽略",
          "选项对比不充分",
        ],
      },
      listening: {
        label: "听力",
        questionTypes: [
          "Form Completion",
          "Note Completion",
          "Table Completion",
          "Sentence Completion",
          "Short Answer",
          "Multiple Choice",
          "Map Labeling",
          "Plan / Diagram Labeling",
          "Matching",
          "Summary Completion",
        ],
        causes: [
          "听漏转折",
          "预测词性失败",
          "拼写错误",
          "单复数错误",
          "数字日期错误",
          "地图跟丢",
          "速度太快没跟上",
        ],
      },
    },
  },
  kaoyan: {
    label: "考研英语",
    sections: {
      reading: {
        label: "阅读",
        questionTypes: [
          "细节理解题",
          "推理判断题",
          "主旨大意题",
          "观点态度题",
          "词义句意题",
          "例证题",
          "文章结构题",
        ],
        causes: [
          "题干定位词抓错",
          "选项偷换概念",
          "转折让步没抓住",
          "态度词强弱误判",
          "推理过度",
          "例证和论点关系没看清",
          "指代句间逻辑没理顺",
          "时间范围对比错位",
          "同义改写链断裂",
          "正确项证据不足",
        ],
      },
      new_question: {
        label: "新题型",
        questionTypes: [
          "七选五",
          "排序题",
          "标题对应",
          "多项对应",
        ],
        causes: [
          "篇章衔接词忽略",
          "代词指代链断裂",
          "段落逻辑顺序判断失误",
          "主题句和支撑句错配",
          "首尾句线索没利用",
          "复现词串联不足",
          "选项对比粒度不够",
          "局部正确整体不通",
        ],
      },
      cloze: {
        label: "完型填空",
        questionTypes: [
          "词义辨析",
          "固定搭配",
          "逻辑关系",
          "上下文复现",
          "语法结构",
          "情感色彩",
          "篇章衔接",
        ],
        causes: [
          "词义色彩判断失误",
          "固定搭配不熟",
          "逻辑关系词误判",
          "复现词没回看",
          "语法结构判断失误",
          "上下文主线没抓住",
          "干扰义项带偏",
          "句间衔接忽略",
        ],
      },
    },
  },
};

const COMMON_CAUSE_OPTIONS = [
  "定位慢",
  "同义替换没识别",
  "干扰项误判",
  "题干审错",
  "复盘不够具体",
];

const DEFAULT_EXAM = "ielts";
const DEFAULT_SECTION_BY_EXAM = {
  ielts: "reading",
  kaoyan: "reading",
};

const STORAGE_KEY = "ielts-review-atlas-fallback";
const CLOUD_SYNC_STORAGE_KEY = "ielts-review-atlas-cloud-sync-v1";
const DB_NAME = "ielts-review-atlas-db";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "journal";
const MAX_AI_IMAGES = 6;
const MAX_AI_IMAGE_DATA_URL_LENGTH = 1200 * 1024;
const LOCAL_PROXY_ORIGIN = "http://127.0.0.1:8000";
const CLOUD_SYNC_DELAY = 1400;
const DEFAULT_CLOUD_SYNC_SESSION = {
  accountId: "",
  token: "",
  lastSyncedAt: 0,
};
const RUNTIME_CONFIG = normalizeRuntimeConfig(window.__IELTS_REVIEW_ATLAS_CONFIG__ || {});

const state = {
  updatedAt: 0,
  entries: [],
  selectedIds: [],
  expandedEntryIds: [],
  editingId: null,
  draftImages: [],
  draftCauseTags: [],
  filters: {
    exam: "all",
    section: "all",
    questionType: "all",
    cause: "all",
    keyword: "",
  },
  aiStatus: {
    available: false,
    provider_label: "GemAI / OpenAI Compatible",
    base_url: "",
    review_model: "gpt-5.1-thinking",
    detail: "正在检查",
  },
  cloud: {
    ...loadCloudSyncSession(),
    syncing: false,
    statusTone: "info",
    statusMessage: "未登录",
    statusDetail: "登上同一个同步账号后，记录会自动备份到云端，换设备也能接着用。",
  },
  latestAiReview: null,
};

const els = {};
let cloudSyncTimer = null;
let cloudSyncInFlight = false;

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  populateSectionSelect();
  populateQuestionTypeSelect();
  renderCauseSelector();
  restoreState()
    .then(() => {
      hydrateQuestionTypeFilter();
      hydrateCauseFilter();
      renderAll();
    })
    .catch(() => {
      renderAll();
    })
    .finally(async () => {
      await refreshAiStatus();
      await syncCloudProgressOnStartup();
    });
});

function cacheElements() {
  Object.assign(els, {
    heroTotalCount: document.querySelector("#hero-total-count"),
    heroTopType: document.querySelector("#hero-top-type"),
    heroTopCause: document.querySelector("#hero-top-cause"),
    heroAiStatus: document.querySelector("#hero-ai-status"),
    heroCloudStatus: document.querySelector("#hero-cloud-status"),
    ieltsCount: document.querySelector("#ielts-count"),
    kaoyanCount: document.querySelector("#kaoyan-count"),
    imageCount: document.querySelector("#image-count"),
    focusSummary: document.querySelector("#focus-summary"),
    focusSummaryNote: document.querySelector("#focus-summary-note"),
    typeBreakdown: document.querySelector("#type-breakdown"),
    causeBreakdown: document.querySelector("#cause-breakdown"),
    insightHighlights: document.querySelector("#insight-highlights"),
    entryForm: document.querySelector("#entry-form"),
    entryExam: document.querySelector("#entry-exam"),
    entrySection: document.querySelector("#entry-section"),
    entrySource: document.querySelector("#entry-source"),
    entryQuestionNumber: document.querySelector("#entry-question-number"),
    entryQuestionType: document.querySelector("#entry-question-type"),
    entryWrongAnswer: document.querySelector("#entry-wrong-answer"),
    entryCorrectAnswer: document.querySelector("#entry-correct-answer"),
    entryErrorReason: document.querySelector("#entry-error-reason"),
    entryTextLocation: document.querySelector("#entry-text-location"),
    entryParaphrase: document.querySelector("#entry-paraphrase"),
    entryReviewNote: document.querySelector("#entry-review-note"),
    entryDifficulty: document.querySelector("#entry-difficulty"),
    entryTags: document.querySelector("#entry-tags"),
    entryAiPriority: document.querySelector("#entry-ai-priority"),
    causeSelector: document.querySelector("#cause-selector"),
    imageInput: document.querySelector("#entry-images"),
    imageDropzone: document.querySelector("#image-dropzone"),
    imagePreview: document.querySelector("#image-preview"),
    formStatus: document.querySelector("#entry-form-status"),
    resetEntryForm: document.querySelector("#reset-entry-form"),
    exportJson: document.querySelector("#export-json"),
    exportCsv: document.querySelector("#export-csv"),
    importJson: document.querySelector("#import-json"),
    aiSideMeta: document.querySelector("#ai-side-meta"),
    cloudAuthForm: document.querySelector("#cloud-auth-form"),
    cloudSyncStatus: document.querySelector("#cloud-sync-status"),
    cloudSyncMeta: document.querySelector("#cloud-sync-meta"),
    cloudAccount: document.querySelector("#cloud-account"),
    cloudPassword: document.querySelector("#cloud-password"),
    cloudAccountChip: document.querySelector("#cloud-account-chip"),
    cloudLastSyncChip: document.querySelector("#cloud-last-sync-chip"),
    cloudRegister: document.querySelector("#cloud-register"),
    cloudLogin: document.querySelector("#cloud-login"),
    cloudSyncNow: document.querySelector("#cloud-sync-now"),
    cloudLogout: document.querySelector("#cloud-logout"),
    filterExam: document.querySelector("#filter-exam"),
    filterSection: document.querySelector("#filter-section"),
    filterQuestionType: document.querySelector("#filter-question-type"),
    filterCause: document.querySelector("#filter-cause"),
    filterKeyword: document.querySelector("#filter-keyword"),
    selectionSummary: document.querySelector("#selection-summary"),
    selectFiltered: document.querySelector("#select-filtered"),
    clearSelection: document.querySelector("#clear-selection"),
    entryList: document.querySelector("#entry-list"),
    aiScope: document.querySelector("#ai-scope"),
    aiGoal: document.querySelector("#ai-goal"),
    aiNote: document.querySelector("#ai-note"),
    runAiReview: document.querySelector("#run-ai-review"),
    aiRequestStatus: document.querySelector("#ai-request-status"),
    aiResult: document.querySelector("#ai-result"),
  });
}

function bindEvents() {
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.querySelector(`#${button.dataset.scrollTarget}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  els.entryExam.addEventListener("change", () => {
    populateSectionSelect();
    populateQuestionTypeSelect();
    filterDraftCauseTagsForSection();
    renderCauseSelector();
    updateFormStatus("题型和标签已经换好了。");
  });

  els.entrySection.addEventListener("change", () => {
    populateQuestionTypeSelect();
    filterDraftCauseTagsForSection();
    renderCauseSelector();
    updateFormStatus("题型已经切换。");
  });

  els.entryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      saveCurrentEntry();
      await persistState({ touch: true });
      renderAll();
      resetForm({ preserveStatus: true });
      updateFormStatus("这条已经记下来了。");
    } catch (error) {
      updateFormStatus(error.message || "保存失败，请重试。", true);
    }
  });

  els.resetEntryForm.addEventListener("click", () => {
    resetForm();
    updateFormStatus("已经清空，可以重新填。");
  });

  els.imageInput.addEventListener("change", async (event) => {
    await addImagesFromFiles(Array.from(event.target.files || []));
    event.target.value = "";
  });

  setupDropzone();

  els.filterQuestionType.addEventListener("change", () => {
    state.filters.questionType = els.filterQuestionType.value;
    renderAll();
  });

  els.filterCause.addEventListener("change", () => {
    state.filters.cause = els.filterCause.value;
    renderAll();
  });

  els.filterExam.addEventListener("change", () => {
    state.filters.exam = els.filterExam.value;
    if (state.filters.exam === "all") {
      state.filters.section = "all";
    } else if (!isValidSectionForExam(state.filters.exam, state.filters.section) && state.filters.section !== "all") {
      state.filters.section = "all";
    }
    renderAll();
  });

  els.filterSection.addEventListener("change", () => {
    state.filters.section = els.filterSection.value;
    renderAll();
  });

  els.filterKeyword.addEventListener("input", () => {
    state.filters.keyword = els.filterKeyword.value.trim();
    renderAll();
  });

  els.selectFiltered.addEventListener("click", async () => {
    const ids = getFilteredEntries().map((entry) => entry.id);
    state.selectedIds = Array.from(new Set([...state.selectedIds, ...ids]));
    await persistState({ touch: true });
    renderAll();
  });

  els.clearSelection.addEventListener("click", async () => {
    state.selectedIds = [];
    await persistState({ touch: true });
    renderAll();
  });

  els.entryList.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-entry-action]");
    if (!actionButton) {
      return;
    }

    const { entryAction, entryId } = actionButton.dataset;
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) {
      return;
    }

    if (entryAction === "edit") {
      startEditingEntry(entry);
      return;
    }

    if (entryAction === "toggle") {
      if (state.expandedEntryIds.includes(entryId)) {
        state.expandedEntryIds = state.expandedEntryIds.filter((id) => id !== entryId);
      } else {
        state.expandedEntryIds = [...state.expandedEntryIds, entryId];
      }
      renderAll();
      return;
    }

    if (entryAction === "duplicate") {
      const duplicated = {
        ...deepClone(entry),
        id: createId(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      state.entries.unshift(duplicated);
      await persistState({ touch: true });
      renderAll();
      updateFormStatus("已经复制一份，你可以接着改。");
      return;
    }

    if (entryAction === "delete") {
      const confirmed = window.confirm("确定删除这条错题吗？");
      if (!confirmed) {
        return;
      }
      state.entries = state.entries.filter((item) => item.id !== entryId);
      state.selectedIds = state.selectedIds.filter((id) => id !== entryId);
      state.expandedEntryIds = state.expandedEntryIds.filter((id) => id !== entryId);
      if (state.editingId === entryId) {
        resetForm();
      }
      await persistState({ touch: true });
      renderAll();
      updateFormStatus("这条已经删掉了。");
    }
  });

  els.entryList.addEventListener("change", async (event) => {
    const checkbox = event.target.closest("[data-entry-select]");
    if (!checkbox) {
      return;
    }
    const { entryId } = checkbox.dataset;
    if (checkbox.checked) {
      state.selectedIds = Array.from(new Set([...state.selectedIds, entryId]));
    } else {
      state.selectedIds = state.selectedIds.filter((id) => id !== entryId);
    }
    await persistState({ touch: true });
    renderAll();
  });

  els.exportJson.addEventListener("click", () => {
    downloadFile("review-atlas.json", "application/json", JSON.stringify(exportSnapshot(), null, 2));
  });

  els.exportCsv.addEventListener("click", () => {
    downloadFile("review-atlas.csv", "text/csv;charset=utf-8", buildCsv(state.entries));
  });

  els.importJson.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const raw = await file.text();
      const payload = JSON.parse(raw);
      importSnapshot(payload);
      await persistState({ touch: true });
      renderAll();
      updateFormStatus("历史记录已导入。");
    } catch (error) {
      updateFormStatus(`导入失败：${error.message || error}`, true);
    } finally {
      event.target.value = "";
    }
  });

  els.runAiReview.addEventListener("click", () => {
    runAiReview();
  });

  if (els.cloudAuthForm) {
    els.cloudAuthForm.addEventListener("submit", (event) => {
      event.preventDefault();
    });
  }

  if (els.cloudRegister) {
    els.cloudRegister.addEventListener("click", () => {
      handleCloudAuth("register");
    });
  }

  if (els.cloudLogin) {
    els.cloudLogin.addEventListener("click", () => {
      handleCloudAuth("login");
    });
  }

  if (els.cloudSyncNow) {
    els.cloudSyncNow.addEventListener("click", () => {
      syncCloudProgressOnStartup({
        announceMessage: "已经帮你重新同步了一次。",
      });
    });
  }

  if (els.cloudLogout) {
    els.cloudLogout.addEventListener("click", () => {
      handleCloudLogout();
    });
  }
}

function getExamConfig(exam = DEFAULT_EXAM) {
  return EXAM_CONFIG[exam] || EXAM_CONFIG[DEFAULT_EXAM];
}

function normalizeExam(exam = DEFAULT_EXAM) {
  return EXAM_CONFIG[exam] ? exam : DEFAULT_EXAM;
}

function getExamLabel(exam = DEFAULT_EXAM) {
  return getExamConfig(exam).label;
}

function getSectionConfig(exam = DEFAULT_EXAM, section = DEFAULT_SECTION_BY_EXAM[DEFAULT_EXAM]) {
  const examConfig = getExamConfig(exam);
  return examConfig.sections[section] || examConfig.sections[DEFAULT_SECTION_BY_EXAM[normalizeExam(exam)]];
}

function getSectionLabel(exam = DEFAULT_EXAM, section = DEFAULT_SECTION_BY_EXAM[DEFAULT_EXAM]) {
  return getSectionConfig(exam, section)?.label || "模块";
}

function getSectionCompositeLabel(exam = DEFAULT_EXAM, section = DEFAULT_SECTION_BY_EXAM[DEFAULT_EXAM]) {
  return `${getExamLabel(exam)} · ${getSectionLabel(exam, section)}`;
}

function isValidSectionForExam(exam, section) {
  return Boolean(getExamConfig(exam).sections[section]);
}

function getActiveFormExam() {
  return normalizeExam(els.entryExam?.value || DEFAULT_EXAM);
}

function getActiveFormSection() {
  const exam = getActiveFormExam();
  const section = els.entrySection?.value || DEFAULT_SECTION_BY_EXAM[exam];
  return isValidSectionForExam(exam, section) ? section : DEFAULT_SECTION_BY_EXAM[exam];
}

function populateSectionSelect() {
  const exam = getActiveFormExam();
  const examConfig = getExamConfig(exam);
  const previousValue = els.entrySection.value;
  const options = Object.entries(examConfig.sections);
  els.entrySection.innerHTML = options
    .map(([value, config]) => `<option value="${escapeHtml(value)}">${escapeHtml(config.label)}</option>`)
    .join("");
  if (options.some(([value]) => value === previousValue)) {
    els.entrySection.value = previousValue;
  } else {
    els.entrySection.value = DEFAULT_SECTION_BY_EXAM[exam];
  }
}

function populateQuestionTypeSelect() {
  const exam = getActiveFormExam();
  const section = getActiveFormSection();
  const options = getSectionConfig(exam, section)?.questionTypes || [];
  const previousValue = els.entryQuestionType.value;
  els.entryQuestionType.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
    .join("");
  if (options.includes(previousValue)) {
    els.entryQuestionType.value = previousValue;
  }
}

function renderCauseSelector() {
  const availableOptions = getAvailableCauseOptions();
  els.causeSelector.innerHTML = availableOptions.map((label) => `
    <button
      class="cause-chip ${state.draftCauseTags.includes(label) ? "is-active" : ""}"
      data-cause-chip="${escapeHtml(label)}"
      type="button"
    >
      ${escapeHtml(label)}
    </button>
  `).join("");

  els.causeSelector.querySelectorAll("[data-cause-chip]").forEach((button) => {
    button.addEventListener("click", () => {
      const label = button.dataset.causeChip;
      if (state.draftCauseTags.includes(label)) {
        state.draftCauseTags = state.draftCauseTags.filter((item) => item !== label);
      } else {
        state.draftCauseTags = [...state.draftCauseTags, label];
      }
      renderCauseSelector();
    });
  });
}

function getAvailableCauseOptions(exam = getActiveFormExam(), section = getActiveFormSection()) {
  const specific = getSectionConfig(exam, section)?.causes || [];
  return uniqueValues([
    ...COMMON_CAUSE_OPTIONS,
    ...specific,
  ]);
}

function filterDraftCauseTagsForSection(section = getActiveFormSection(), exam = getActiveFormExam()) {
  const available = new Set(getAvailableCauseOptions(exam, section));
  state.draftCauseTags = state.draftCauseTags.filter((tag) => available.has(tag));
}

function renderAll() {
  renderDashboard();
  renderFilters();
  renderEntryList();
  renderAiStatus();
  renderCloudSyncUi();
  renderAiResult();
}

function renderDashboard() {
  const stats = buildStats(state.entries);
  els.heroTotalCount.textContent = String(stats.total);
  els.heroTopType.textContent = stats.topType?.label || "还没形成";
  els.heroTopCause.textContent = stats.topCause?.label || "还没形成";
  els.ieltsCount.textContent = String(stats.byExam.ielts);
  els.kaoyanCount.textContent = String(stats.byExam.kaoyan);
  els.imageCount.textContent = String(stats.imageCount);
  els.focusSummary.textContent = stats.focusSummary.title;
  els.focusSummaryNote.textContent = stats.focusSummary.note;

  renderRankList(els.typeBreakdown, stats.typeRanking, "先录几条错题，这里就会显示高频题型。");
  renderRankList(els.causeBreakdown, stats.causeRanking, "给每题打上结构化错因标签，这里会越来越清楚。");

  const noteEntries = state.entries
    .filter((entry) => entry.reviewNote)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 4);

  if (!noteEntries.length) {
    els.insightHighlights.innerHTML = renderEmptyState("还没有复盘心得", "保存几条带心得的错题后，这里会自动摘取重点。");
    return;
  }

  els.insightHighlights.innerHTML = noteEntries.map((entry) => `
    <article class="insight-card">
      <strong>${escapeHtml(entry.source)} · ${escapeHtml(entry.questionNumber)}</strong>
      <p>${escapeHtml(truncate(entry.reviewNote, 120))}</p>
    </article>
  `).join("");
}

function renderRankList(container, items, emptyText) {
  if (!items.length) {
    container.innerHTML = renderEmptyState("还没有统计数据", emptyText);
    return;
  }

  const topValue = items[0]?.count || 1;
  container.innerHTML = items.slice(0, 5).map((item) => {
    const width = Math.max(12, Math.round((item.count / topValue) * 100));
    return `
      <div class="rank-item">
        <div class="rank-item__row">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${item.count} 次</span>
        </div>
        <div class="rank-item__bar">
          <div class="rank-item__fill" style="width:${width}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderFilters() {
  hydrateExamFilter();
  hydrateSectionFilter();
  hydrateQuestionTypeFilter();
  hydrateCauseFilter();
  els.filterExam.value = state.filters.exam;
  els.filterSection.value = state.filters.section;
  els.filterQuestionType.value = state.filters.questionType;
  els.filterCause.value = state.filters.cause;
  els.filterKeyword.value = state.filters.keyword;
}

function hydrateExamFilter() {
  els.filterExam.innerHTML = [
    '<option value="all">全部考试体系</option>',
    ...Object.entries(EXAM_CONFIG).map(([value, config]) => `<option value="${escapeHtml(value)}">${escapeHtml(config.label)}</option>`),
  ].join("");
  if (![...Object.keys(EXAM_CONFIG), "all"].includes(state.filters.exam)) {
    state.filters.exam = "all";
  }
}

function hydrateSectionFilter() {
  const sections = state.filters.exam === "all"
    ? uniqueValues(
        state.entries.map((entry) => `${entry.exam}:${entry.section}`),
      ).map((value) => {
        const [exam, section] = value.split(":");
        return {
          value,
          label: getSectionCompositeLabel(exam, section),
        };
      })
    : Object.keys(getExamConfig(state.filters.exam).sections).map((section) => ({
        value: section,
        label: getSectionLabel(state.filters.exam, section),
      }));

  els.filterSection.innerHTML = [
    '<option value="all">全部模块</option>',
    ...sections.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`),
  ].join("");

  const validValues = new Set(["all", ...sections.map((option) => option.value)]);
  if (!validValues.has(state.filters.section)) {
    state.filters.section = "all";
  }
}

function hydrateQuestionTypeFilter() {
  const allTypes = uniqueValues(
    getFilteredEntriesForStats()
      .map((entry) => entry.questionType)
      .filter(Boolean),
  );
  const currentValue = state.filters.questionType;
  els.filterQuestionType.innerHTML = [
    '<option value="all">全部题型</option>',
    ...allTypes.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`),
  ].join("");
  if (!allTypes.includes(currentValue) && currentValue !== "all") {
    state.filters.questionType = "all";
  }
}

function hydrateCauseFilter() {
  const allCauses = uniqueValues(
    getFilteredEntriesForStats().flatMap((entry) => entry.causeTags || []),
  );
  const currentValue = state.filters.cause;
  els.filterCause.innerHTML = [
    '<option value="all">全部错因</option>',
    ...allCauses.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`),
  ].join("");
  if (!allCauses.includes(currentValue) && currentValue !== "all") {
    state.filters.cause = "all";
  }
}

function renderEntryList() {
  const filteredEntries = getFilteredEntries();
  const selectedCount = state.selectedIds.length;
  els.selectionSummary.textContent = `已选 ${selectedCount} 条，当前筛出 ${filteredEntries.length} 条。`;

  if (!filteredEntries.length) {
    els.entryList.innerHTML = renderEmptyState("这里暂时还是空的", "可以先记一题，或者把筛选条件放宽一点。");
    return;
  }

  els.entryList.innerHTML = filteredEntries
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map((entry) => renderEntryCard(entry))
    .join("");
}

function renderEntryCard(entry) {
  const selected = state.selectedIds.includes(entry.id);
  const expanded = state.expandedEntryIds.includes(entry.id);
  const imageCount = entry.images?.length || 0;
  const tags = [...(entry.causeTags || []), ...(entry.tags || [])].slice(0, 8);
  const summaryText = buildEntrySummary(entry);

  return `
    <article class="entry-card ${expanded ? "is-expanded" : ""}">
      <div class="entry-card__top">
        <div class="entry-card__title">
          <span class="tag">${escapeHtml(getExamLabel(entry.exam))}</span>
          <span class="tag">${escapeHtml(getSectionLabel(entry.exam, entry.section))}</span>
          <strong>${escapeHtml(entry.source)} · ${escapeHtml(entry.questionNumber)}</strong>
          <span class="badge">${escapeHtml(entry.questionType)}</span>
          <span class="image-count-badge">${imageCount} 张图</span>
        </div>
        <label class="entry-card__selector">
          <input data-entry-select data-entry-id="${entry.id}" type="checkbox" ${selected ? "checked" : ""} />
          加入 AI 复盘
        </label>
      </div>

      <div class="entry-card__meta">
        <span>错误选项：${escapeHtml(entry.wrongAnswer || "未填")}</span>
        <span>正确选项：${escapeHtml(entry.correctAnswer || "未填")}</span>
        <span>难度：${escapeHtml(String(entry.difficulty || 3))}/5</span>
        <span>优先级：${escapeHtml(entry.aiPriority || "normal")}</span>
      </div>

      <div class="entry-card__preview">
        <p>${escapeHtml(summaryText)}</p>
      </div>

      <div class="entry-card__body ${expanded ? "is-visible" : ""}">
        ${renderEntryField("错因", entry.errorReason)}
        ${renderEntryField("原文定位", entry.textLocation)}
        ${renderEntryField("同义替换", entry.paraphrase)}
        ${renderEntryField("复盘心得", entry.reviewNote)}
      </div>

      <div class="entry-card__footer">
        <div class="inline-actions">
          ${tags.map((tag) => `<span class="entry-chip">${escapeHtml(tag)}</span>`).join("") || '<span class="entry-chip entry-chip--danger">暂未打标签</span>'}
        </div>
        <div class="inline-actions">
          <button class="button button--ghost button--small" data-entry-action="toggle" data-entry-id="${entry.id}" type="button">${expanded ? "收起详情" : "展开详情"}</button>
          <button class="button button--ghost button--small" data-entry-action="edit" data-entry-id="${entry.id}" type="button">编辑</button>
          <button class="button button--ghost button--small" data-entry-action="duplicate" data-entry-id="${entry.id}" type="button">复制</button>
          <button class="button button--ghost button--small" data-entry-action="delete" data-entry-id="${entry.id}" type="button">删除</button>
        </div>
      </div>
    </article>
  `;
}

function buildEntrySummary(entry) {
  const parts = [
    entry.errorReason,
    entry.reviewNote,
    entry.textLocation,
    entry.paraphrase,
  ].map((item) => String(item || "").trim()).filter(Boolean);

  if (!parts.length) {
    return "这条错题暂时还没有展开说明，建议至少补一句为什么会错或下一次怎么避免。";
  }

  return truncate(parts.join(" "), 120);
}

function renderEntryField(label, value) {
  return `
    <div class="entry-card__field">
      <span>${escapeHtml(label)}</span>
      <p>${escapeHtml(value || "未填写")}</p>
    </div>
  `;
}

function renderAiStatus() {
  const aiStatus = state.aiStatus;
  els.heroAiStatus.textContent = aiStatus.available
    ? `${aiStatus.provider_label} 已连接`
    : "未连接";
  els.aiSideMeta.textContent = aiStatus.available
    ? "现在可以直接在线生成复盘总结了，系统会结合你选中的错题、统计和截图一起看。"
    : "现在还连不上在线总结服务，稍后再刷新看看。";
}

function renderCloudSyncUi() {
  if (!els.cloudSyncStatus) {
    return;
  }

  const backendAvailable = hasCloudSyncSupport();
  const loggedIn = backendAvailable && Boolean(state.cloud.token);
  const statusMessage = state.cloud.statusMessage || "未登录";
  const statusTone = state.cloud.statusTone || "info";
  const lastSyncLabel = state.cloud.lastSyncedAt ? formatDateTime(state.cloud.lastSyncedAt) : "尚未同步";

  els.heroCloudStatus.textContent = backendAvailable
    ? (loggedIn ? `${state.cloud.accountId} 已连接` : "可登录")
    : "暂不可用";
  els.cloudSyncStatus.textContent = `云端同步：${statusMessage}`;
  els.cloudSyncStatus.className = `badge badge--cloud chip--${statusTone}`;
  els.cloudSyncMeta.textContent = state.cloud.statusDetail || getDefaultCloudSyncDetail();
  els.cloudAccountChip.textContent = loggedIn ? `当前账号：${state.cloud.accountId}` : "当前：本地模式";
  els.cloudLastSyncChip.textContent = `最近同步：${lastSyncLabel}`;

  if (els.cloudAccount) {
    if (loggedIn) {
      els.cloudAccount.value = state.cloud.accountId;
    }
    els.cloudAccount.disabled = state.cloud.syncing || !backendAvailable;
  }

  if (els.cloudPassword) {
    els.cloudPassword.disabled = state.cloud.syncing || !backendAvailable;
  }

  if (els.cloudRegister) {
    els.cloudRegister.disabled = state.cloud.syncing || !backendAvailable;
  }
  if (els.cloudLogin) {
    els.cloudLogin.disabled = state.cloud.syncing || !backendAvailable;
  }
  if (els.cloudSyncNow) {
    els.cloudSyncNow.disabled = state.cloud.syncing || !loggedIn || !backendAvailable;
  }
  if (els.cloudLogout) {
    els.cloudLogout.disabled = state.cloud.syncing || !loggedIn || !backendAvailable;
  }
}

function renderAiResult() {
  const payload = state.latestAiReview;
  if (!payload) {
    els.aiResult.innerHTML = renderEmptyState("还没开始总结", "先勾几道想重点看的题，再来生成这一轮复盘。");
    return;
  }

  const review = payload.review || {};
  els.aiResult.innerHTML = `
    <article class="ai-card">
      <div class="ai-card__hero">
        <div class="inline-actions">
          <span class="tag">${escapeHtml(payload.provider_label || state.aiStatus.provider_label)}</span>
          <span class="badge">${escapeHtml(payload.review_model || state.aiStatus.review_model || "gpt-5.1-thinking")}</span>
        </div>
        <h3>这一轮错题复盘总结</h3>
        <p class="ai-summary">${escapeHtml(review.summary || "这一轮还没拿到总结。")}</p>
        ${renderAiSupportNote(payload)}
      </div>

      <div class="ai-sections">
        <section class="ai-section">
          <h3>能力快照</h3>
          <ul>
            <li><strong>当前更稳：</strong>${escapeHtml(review.ability_snapshot?.stronger_section || "待判断")}</li>
            <li><strong>更危险：</strong>${escapeHtml(review.ability_snapshot?.risk_section || "待判断")}</li>
            <li><strong>主要模式：</strong>${escapeHtml(review.ability_snapshot?.accuracy_pattern || "待判断")}</li>
          </ul>
        </section>

        <section class="ai-section">
          <h3>最该马上改的动作</h3>
          ${renderStringList(review.next_actions, "暂时还没有动作建议。")}
        </section>

        <section class="ai-section">
          <h3>高频题型</h3>
          ${renderPatternList(review.recurring_question_types, "question_type")}
        </section>

        <section class="ai-section">
          <h3>高频错因</h3>
          ${renderPatternList(review.recurring_error_causes, "cause")}
        </section>

        <section class="ai-section">
          <h3>图片观察</h3>
          ${renderImageNotes(review.image_observations)}
        </section>

        <section class="ai-section">
          <h3>心得提炼</h3>
          ${renderStringList(review.reflection_highlights, "等你多写几条心得后，这里会更有价值。")}
        </section>

        <section class="ai-section">
          <h3>下一轮训练单</h3>
          ${renderStringList(review.next_drill_plan, "AI 还没有返回训练单。")}
        </section>

        <section class="ai-section">
          <h3>教练留言</h3>
          <p>${escapeHtml(review.coach_message || "AI 还没有返回教练留言。")}</p>
        </section>
      </div>
    </article>
  `;
}

function renderPatternList(items, key) {
  if (!Array.isArray(items) || !items.length) {
    return "<p>暂无结构化结果。</p>";
  }
  return items.map((item) => `
    <div class="ai-pattern">
      <strong>${escapeHtml(item[key] || "未命名")}${item.count ? ` · ${item.count} 次` : ""}</strong>
      <p>${escapeHtml(item.pattern || item.why_wrong || "这块暂时还没提炼出清楚的模式。")}</p>
      <p><strong>修正：</strong>${escapeHtml(item.fix || "待补充")}</p>
    </div>
  `).join("");
}

function renderImageNotes(items) {
  if (!Array.isArray(items) || !items.length) {
    return "<p>这次没有图片观察，可能是本轮没有上传截图。</p>";
  }
  return items.map((item) => `
    <div class="ai-image-note">
      <strong>${escapeHtml(item.image_label || "题目截图")}</strong>
      <p>${escapeHtml(item.observation || "这张图暂时还没整理出更具体的观察。")}</p>
      <p><strong>意义：</strong>${escapeHtml(item.implication || "待补充")}</p>
    </div>
  `).join("");
}

function renderStringList(items, emptyText) {
  if (!Array.isArray(items) || !items.length) {
    return `<p>${escapeHtml(emptyText)}</p>`;
  }
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderAiSupportNote(payload) {
  const notes = [];
  if (payload.image_fallback_used) {
    notes.push(payload.image_fallback_message || "这轮截图没能顺利带进在线分析，我先按文字记录把总结整理出来了。");
  }
  if (payload.json_repair_used) {
    notes.push("这轮返回格式有点乱，已经自动整理成可以阅读的总结。");
  }

  const analyzedCount = Number(payload.images_analyzed || 0);
  if (!notes.length && analyzedCount > 0) {
    notes.push(`这轮一并参考了 ${analyzedCount} 张截图。`);
  }

  return notes.map((note) => `<p class="ai-support-note">${escapeHtml(note)}</p>`).join("");
}

function setupDropzone() {
  ["dragenter", "dragover"].forEach((eventName) => {
    els.imageDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.imageDropzone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.imageDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.imageDropzone.classList.remove("is-dragging");
    });
  });

  els.imageDropzone.addEventListener("drop", async (event) => {
    const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith("image/"));
    await addImagesFromFiles(files);
  });

  els.imageDropzone.addEventListener("paste", async (event) => {
    const files = Array.from(event.clipboardData?.items || [])
      .map((item) => item.getAsFile())
      .filter((file) => file && file.type.startsWith("image/"));
    if (!files.length) {
      return;
    }
    event.preventDefault();
    await addImagesFromFiles(files);
  });
}

async function addImagesFromFiles(files) {
  if (!files.length) {
    return;
  }

  const normalized = [];
  for (const file of files.slice(0, 12)) {
    const image = await normalizeImageFile(file);
    normalized.push(image);
  }
  state.draftImages = [...state.draftImages, ...normalized];
  renderDraftImages();
  updateFormStatus(`已加入 ${normalized.length} 张图片。`);
}

function renderDraftImages() {
  if (!state.draftImages.length) {
    els.imagePreview.innerHTML = "";
    return;
  }

  els.imagePreview.innerHTML = state.draftImages.map((image) => `
    <article class="image-thumb">
      <img alt="${escapeHtml(image.name)}" src="${image.dataUrl}" />
      <div class="image-thumb__meta">
        <span class="image-thumb__name">${escapeHtml(image.name)}</span>
        <button class="button button--ghost button--small" data-remove-image="${image.id}" type="button">移除</button>
      </div>
    </article>
  `).join("");

  els.imagePreview.querySelectorAll("[data-remove-image]").forEach((button) => {
    button.addEventListener("click", () => {
      state.draftImages = state.draftImages.filter((image) => image.id !== button.dataset.removeImage);
      renderDraftImages();
    });
  });
}

function saveCurrentEntry() {
  const source = els.entrySource.value.trim();
  const questionNumber = els.entryQuestionNumber.value.trim();
  const questionType = els.entryQuestionType.value.trim();

  if (!source || !questionNumber || !questionType) {
    throw new Error("题目来源、题号和题型需要填写完整。");
  }

  const now = Date.now();
  const entry = {
    id: state.editingId || createId(),
    exam: getActiveFormExam(),
    section: getActiveFormSection(),
    source,
    questionNumber,
    questionType,
    wrongAnswer: els.entryWrongAnswer.value.trim(),
    correctAnswer: els.entryCorrectAnswer.value.trim(),
    errorReason: els.entryErrorReason.value.trim(),
    textLocation: els.entryTextLocation.value.trim(),
    paraphrase: els.entryParaphrase.value.trim(),
    reviewNote: els.entryReviewNote.value.trim(),
    difficulty: Number(els.entryDifficulty.value || 3),
    tags: parseTagInput(els.entryTags.value),
    causeTags: uniqueValues(state.draftCauseTags),
    aiPriority: els.entryAiPriority.value,
    images: deepClone(state.draftImages),
    createdAt: state.editingId
      ? state.entries.find((item) => item.id === state.editingId)?.createdAt || now
      : now,
    updatedAt: now,
  };

  const index = state.entries.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    state.entries.splice(index, 1, entry);
  } else {
    state.entries.unshift(entry);
  }

  if (!state.selectedIds.includes(entry.id)) {
    state.selectedIds = [...state.selectedIds, entry.id];
  }
}

function startEditingEntry(entry) {
  state.editingId = entry.id;
  state.draftCauseTags = [...(entry.causeTags || [])];
  state.draftImages = deepClone(entry.images || []);
  els.entryExam.value = normalizeExam(entry.exam);
  populateSectionSelect();
  els.entrySection.value = entry.section;
  populateQuestionTypeSelect();
  els.entrySource.value = entry.source;
  els.entryQuestionNumber.value = entry.questionNumber;
  els.entryQuestionType.value = entry.questionType;
  els.entryWrongAnswer.value = entry.wrongAnswer || "";
  els.entryCorrectAnswer.value = entry.correctAnswer || "";
  els.entryErrorReason.value = entry.errorReason || "";
  els.entryTextLocation.value = entry.textLocation || "";
  els.entryParaphrase.value = entry.paraphrase || "";
  els.entryReviewNote.value = entry.reviewNote || "";
  els.entryDifficulty.value = String(entry.difficulty || 3);
  els.entryTags.value = (entry.tags || []).join(", ");
  els.entryAiPriority.value = entry.aiPriority || "normal";
  renderCauseSelector();
  renderDraftImages();
  document.querySelector("#capture")?.scrollIntoView({ behavior: "smooth", block: "start" });
  updateFormStatus("正在编辑这条错题，保存后会覆盖原记录。");
}

function resetForm(options = {}) {
  state.editingId = null;
  state.draftImages = [];
  state.draftCauseTags = [];
  els.entryForm.reset();
  els.entryExam.value = DEFAULT_EXAM;
  populateSectionSelect();
  populateQuestionTypeSelect();
  els.entryDifficulty.value = "3";
  els.entryAiPriority.value = "normal";
  renderCauseSelector();
  renderDraftImages();
  if (!options.preserveStatus) {
    updateFormStatus("这页会自动保存，不用担心白填。");
  }
}

function getFilteredEntriesForStats() {
  return state.entries.filter((entry) => {
    if (state.filters.exam !== "all" && entry.exam !== state.filters.exam) {
      return false;
    }
    if (state.filters.section === "all") {
      return true;
    }
    if (state.filters.exam === "all") {
      return `${entry.exam}:${entry.section}` === state.filters.section;
    }
    return entry.section === state.filters.section;
  });
}

function getFilteredEntries() {
  return state.entries.filter((entry) => {
    if (state.filters.exam !== "all" && entry.exam !== state.filters.exam) {
      return false;
    }
    if (state.filters.section !== "all") {
      if (state.filters.exam === "all") {
        if (`${entry.exam}:${entry.section}` !== state.filters.section) {
          return false;
        }
      } else if (entry.section !== state.filters.section) {
        return false;
      }
    }
    if (state.filters.questionType !== "all" && entry.questionType !== state.filters.questionType) {
      return false;
    }
    if (state.filters.cause !== "all" && !(entry.causeTags || []).includes(state.filters.cause)) {
      return false;
    }
    if (!state.filters.keyword) {
      return true;
    }

    const haystack = [
      getExamLabel(entry.exam),
      getSectionLabel(entry.exam, entry.section),
      entry.source,
      entry.questionNumber,
      entry.questionType,
      entry.wrongAnswer,
      entry.correctAnswer,
      entry.errorReason,
      entry.textLocation,
      entry.paraphrase,
      entry.reviewNote,
      ...(entry.tags || []),
      ...(entry.causeTags || []),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(state.filters.keyword.toLowerCase());
  });
}

function buildStats(entries) {
  const byExam = {
    ielts: entries.filter((entry) => entry.exam === "ielts").length,
    kaoyan: entries.filter((entry) => entry.exam === "kaoyan").length,
  };
  const areaRanking = countLabels(entries.map((entry) => getSectionCompositeLabel(entry.exam, entry.section)));
  const typeRanking = countLabels(entries.map((entry) => entry.questionType));
  const causeRanking = countLabels(entries.flatMap((entry) => entry.causeTags || []));
  const topArea = areaRanking[0] || null;
  const topType = typeRanking[0] || null;
  const topCause = causeRanking[0] || null;
  const imageCount = entries.reduce((sum, entry) => sum + (entry.images?.length || 0), 0);

  let title = "先记一题";
  let note = "有几条记录以后，这里会更清楚地提醒你该先补哪一块。";
  if (entries.length) {
    const typeLabel = topType?.label || "当前主错题型";
    const causeLabel = topCause?.label || "主要失误";
    title = `${topArea?.label || "当前薄弱区"}先补 ${typeLabel}`;
    note = `最近最常见的错因是“${causeLabel}”，下一轮练题时优先针对这一点做动作设计。`;
  }

  return {
    total: entries.length,
    byExam,
    areaRanking,
    typeRanking,
    causeRanking,
    topArea,
    topType,
    topCause,
    imageCount,
    focusSummary: {
      title,
      note,
    },
  };
}

function countLabels(labels) {
  const counts = new Map();
  labels.filter(Boolean).forEach((label) => {
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
}

async function refreshAiStatus() {
  const fallback = {
    available: false,
    provider_label: "GemAI / OpenAI Compatible",
    review_model: "gpt-5.1-thinking",
    detail: "在线总结服务暂时还没连上。",
  };

  try {
    const response = await fetch(getAiApiUrl("/api/ai/error-review-status"), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`状态接口暂时不可用：${response.status}`);
    }
    const payload = await response.json();
    state.aiStatus = {
      ...fallback,
      ...payload,
      detail: payload.available
        ? `${payload.provider_label || fallback.provider_label} · ${payload.review_model || fallback.review_model}`
        : payload.error || fallback.detail,
    };
  } catch (error) {
    state.aiStatus = {
      ...fallback,
      detail: fallback.detail,
    };
  }
  renderAiStatus();
}

async function runAiReview() {
  const entries = resolveAiScopeEntries();
  if (!entries.length) {
    els.aiRequestStatus.textContent = "先选几条错题再开始";
    return;
  }

  els.runAiReview.disabled = true;
  els.aiRequestStatus.textContent = "正在整理这轮错题，请稍等…";

  const payload = {
    scope: els.aiScope.value,
    focus_goal: els.aiGoal.value.trim(),
    note: els.aiNote.value.trim(),
    entries: entries.map((entry) => ({
      id: entry.id,
      exam: entry.exam,
      section: entry.section,
      source: entry.source,
      question_number: entry.questionNumber,
      question_type: entry.questionType,
      wrong_answer: entry.wrongAnswer,
      correct_answer: entry.correctAnswer,
      cause_tags: entry.causeTags || [],
      error_reason: entry.errorReason,
      text_location: entry.textLocation,
      paraphrase: entry.paraphrase,
      review_note: entry.reviewNote,
      difficulty: entry.difficulty,
      tags: entry.tags || [],
      ai_priority: entry.aiPriority || "normal",
    })),
    stats: buildAiStatsPayload(entries),
    images: collectAiImages(entries).map((image) => ({
      entry_id: image.entryId,
      image_label: image.entryLabel,
      name: image.name,
      data_url: image.dataUrl,
    })),
  };

  try {
    const response = await fetch(getAiApiUrl("/api/ai/error-review"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `请求失败：${response.status}`);
    }
    state.latestAiReview = result;
    const quotaHint = Number.isFinite(Number(result.daily_remaining))
      ? ` · 今日剩余 ${Math.max(0, Number(result.daily_remaining || 0))} 次`
      : "";
    const imageHint = result.image_fallback_used
      ? " · 截图这轮没带进去，先按文字记录生成了总结"
      : "";
    const repairHint = result.json_repair_used
      ? " · 返回格式已自动整理"
      : "";
    els.aiRequestStatus.textContent = `这轮总结已经生成${imageHint}${repairHint}${quotaHint}`;
    renderAiResult();
    await persistState({ touch: true });
  } catch (error) {
    els.aiRequestStatus.textContent = formatAiReviewError(error);
  } finally {
    els.runAiReview.disabled = false;
  }
}

function formatAiReviewError(error) {
  const message = String(error?.message || "").trim();
  if (!message) {
    return "这次没有顺利生成，稍后再试一次。";
  }
  if (message.includes("今日 AI 复盘次数已达")) {
    return message;
  }
  if (message.includes("520")) {
    return "这轮没有顺利生成，像是在线接口刚刚卡了一下。等一会儿再试，或者先去掉截图试一次。";
  }
  if (message.includes("无法解析的 JSON") || message.includes("返回的结果格式")) {
    return "这轮返回格式有点乱，页面没能整理出来。你可以再点一次生成，系统会尽量自动修正。";
  }
  return message;
}

function resolveAiScopeEntries() {
  if (els.aiScope.value === "all") {
    return state.entries;
  }
  if (els.aiScope.value === "filtered") {
    return getFilteredEntries();
  }
  return state.entries.filter((entry) => state.selectedIds.includes(entry.id));
}

function buildAiStatsPayload(entries) {
  const stats = buildStats(entries);
  return {
    total_entries: stats.total,
    by_exam: stats.byExam,
    top_areas: stats.areaRanking.slice(0, 5),
    top_question_types: stats.typeRanking.slice(0, 5),
    top_causes: stats.causeRanking.slice(0, 5),
    with_images: entries.filter((entry) => (entry.images?.length || 0) > 0).length,
    average_difficulty: entries.length
      ? Number((entries.reduce((sum, entry) => sum + Number(entry.difficulty || 0), 0) / entries.length).toFixed(2))
      : 0,
    latest_reflections: entries
      .filter((entry) => entry.reviewNote)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 5)
      .map((entry) => ({
        source: entry.source,
        question_number: entry.questionNumber,
        review_note: entry.reviewNote,
      })),
  };
}

function collectAiImages(entries) {
  const scoredImages = entries.flatMap((entry) => {
    const priorityScore = entry.aiPriority === "high" ? 3 : entry.aiPriority === "normal" ? 2 : 1;
    return (entry.images || []).map((image, index) => ({
      ...image,
      entryId: entry.id,
      entryLabel: `${entry.source} · ${entry.questionNumber} · 图 ${index + 1}`,
      score: priorityScore * 1000000 + Number(entry.updatedAt || 0),
    }));
  });

  return scoredImages
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_AI_IMAGES);
}

function exportSnapshot() {
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    updatedAt: state.updatedAt || Date.now(),
    entries: state.entries,
    selectedIds: state.selectedIds,
    latestAiReview: state.latestAiReview,
  };
}

function importSnapshot(payload) {
  if (!payload || !Array.isArray(payload.entries)) {
    throw new Error("导入文件格式不正确。");
  }
  state.updatedAt = Number(payload.updatedAt || payload.meta?.updatedAt || Date.now()) || Date.now();
  state.entries = payload.entries.map(normalizeImportedEntry);
  state.selectedIds = Array.isArray(payload.selectedIds) ? payload.selectedIds.filter(Boolean) : [];
  state.latestAiReview = payload.latestAiReview || null;
  resetForm({ preserveStatus: true });
}

function normalizeImportedEntry(entry) {
  const exam = normalizeExam(entry.exam || entry.examType || DEFAULT_EXAM);
  const rawSection = String(entry.section || entry.module || "").trim();
  const fallbackSection = DEFAULT_SECTION_BY_EXAM[exam];
  const normalizedSection = isValidSectionForExam(exam, rawSection) ? rawSection : fallbackSection;
  const defaultQuestionType = getSectionConfig(exam, normalizedSection)?.questionTypes?.[0] || "Multiple Choice";
  return {
    id: entry.id || createId(),
    exam,
    section: normalizedSection,
    source: String(entry.source || "").trim(),
    questionNumber: String(entry.questionNumber || entry.question_number || "").trim(),
    questionType: String(entry.questionType || entry.question_type || "").trim() || defaultQuestionType,
    wrongAnswer: String(entry.wrongAnswer || entry.wrong_answer || "").trim(),
    correctAnswer: String(entry.correctAnswer || entry.correct_answer || "").trim(),
    errorReason: String(entry.errorReason || entry.error_reason || "").trim(),
    textLocation: String(entry.textLocation || entry.text_location || "").trim(),
    paraphrase: String(entry.paraphrase || "").trim(),
    reviewNote: String(entry.reviewNote || entry.review_note || "").trim(),
    difficulty: clampNumber(entry.difficulty, 1, 5, 3),
    tags: uniqueValues(Array.isArray(entry.tags) ? entry.tags.map(String) : parseTagInput(entry.tags || "")),
    causeTags: uniqueValues(Array.isArray(entry.causeTags || entry.cause_tags) ? (entry.causeTags || entry.cause_tags).map(String) : []),
    aiPriority: ["high", "normal", "low"].includes(entry.aiPriority || entry.ai_priority)
      ? (entry.aiPriority || entry.ai_priority)
      : "normal",
    images: Array.isArray(entry.images)
      ? entry.images
          .map((image) => ({
            id: image.id || createId(),
            name: String(image.name || "screenshot.png"),
            type: String(image.type || "image/png"),
            dataUrl: String(image.dataUrl || image.data_url || ""),
            size: Number(image.size || 0),
          }))
          .filter((image) => image.dataUrl.startsWith("data:image/"))
      : [],
    createdAt: Number(entry.createdAt || entry.created_at || Date.now()),
    updatedAt: Number(entry.updatedAt || entry.updated_at || Date.now()),
  };
}

function buildCsv(entries) {
  const headers = [
    "考试体系",
    "模块",
    "题目来源",
    "题号",
    "题型",
    "错误选项",
    "正确选项",
    "错因标签",
    "错因展开",
    "原文定位",
    "同义替换",
    "复盘心得",
    "难度",
    "自定义标签",
    "图片数量",
    "优先级",
    "更新时间",
  ];

  const rows = entries.map((entry) => [
    getExamLabel(entry.exam),
    getSectionLabel(entry.exam, entry.section),
    entry.source,
    entry.questionNumber,
    entry.questionType,
    entry.wrongAnswer,
    entry.correctAnswer,
    (entry.causeTags || []).join(" / "),
    entry.errorReason,
    entry.textLocation,
    entry.paraphrase,
    entry.reviewNote,
    String(entry.difficulty || 3),
    (entry.tags || []).join(" / "),
    String(entry.images?.length || 0),
    entry.aiPriority || "normal",
    new Date(entry.updatedAt || Date.now()).toLocaleString(),
  ]);

  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

function csvCell(value) {
  const text = String(value || "");
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function downloadFile(filename, contentType, content) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function normalizeImageFile(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const maxDimension = 1440;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  let width = Math.max(1, Math.round(image.width * scale));
  let height = Math.max(1, Math.round(image.height * scale));
  let quality = 0.82;
  let normalizedDataUrl = "";
  const canvas = document.createElement("canvas");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    normalizedDataUrl = canvas.toDataURL("image/jpeg", quality);
    if (normalizedDataUrl.length <= MAX_AI_IMAGE_DATA_URL_LENGTH) {
      break;
    }
    width = Math.max(1, Math.round(width * 0.82));
    height = Math.max(1, Math.round(height * 0.82));
    quality = Math.max(0.6, quality - 0.08);
  }

  return {
    id: createId(),
    name: toJpegFileName(file.name || `screenshot-${Date.now()}.png`),
    type: "image/jpeg",
    size: normalizedDataUrl.length,
    dataUrl: normalizedDataUrl,
  };
}

function toJpegFileName(name) {
  const base = String(name || "").replace(/\.[^.]+$/, "").trim() || `screenshot-${Date.now()}`;
  return `${base}.jpg`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = dataUrl;
  });
}

async function restoreState() {
  const snapshot = await loadSnapshot();
  if (!snapshot) {
    state.updatedAt = 0;
    resetForm({ preserveStatus: true });
    return;
  }
  state.updatedAt = Number(snapshot.updatedAt || snapshot.meta?.updatedAt || 0) || 0;
  state.entries = Array.isArray(snapshot.entries) ? snapshot.entries.map(normalizeImportedEntry) : [];
  state.selectedIds = Array.isArray(snapshot.selectedIds) ? snapshot.selectedIds.filter(Boolean) : [];
  state.latestAiReview = snapshot.latestAiReview || null;
  resetForm({ preserveStatus: true });
}

async function persistState(options = {}) {
  if (options.touch) {
    state.updatedAt = Date.now();
  } else if (!state.updatedAt) {
    state.updatedAt = Date.now();
  }

  await saveSnapshot(buildStateSnapshot());

  if (!options.skipCloudSync) {
    scheduleCloudProgressSync();
  }
}

async function loadSnapshot() {
  if (window.indexedDB) {
    try {
      const db = await openDatabase();
      const value = await idbGet(db, SNAPSHOT_KEY);
      if (value) {
        return value;
      }
    } catch {
      // Fallback to localStorage below.
    }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveSnapshot(snapshot) {
  if (window.indexedDB) {
    try {
      const db = await openDatabase();
      await idbSet(db, SNAPSHOT_KEY, snapshot);
    } catch {
      // Fall back to localStorage below.
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function buildStateSnapshot() {
  return {
    version: 2,
    updatedAt: Number(state.updatedAt || 0) || Date.now(),
    entries: state.entries,
    selectedIds: state.selectedIds,
    latestAiReview: state.latestAiReview,
  };
}

function normalizeCloudSyncSession(parsed = {}) {
  const input = parsed && typeof parsed === "object" ? parsed : {};
  return {
    accountId: String(input.accountId || "").trim().toLowerCase(),
    token: String(input.token || "").trim(),
    lastSyncedAt: Number(input.lastSyncedAt || 0) || 0,
  };
}

function loadCloudSyncSession() {
  try {
    const raw = localStorage.getItem(CLOUD_SYNC_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_CLOUD_SYNC_SESSION };
    }
    return normalizeCloudSyncSession(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CLOUD_SYNC_SESSION };
  }
}

function persistCloudSyncSession() {
  localStorage.setItem(
    CLOUD_SYNC_STORAGE_KEY,
    JSON.stringify({
      accountId: state.cloud.accountId,
      token: state.cloud.token,
      lastSyncedAt: state.cloud.lastSyncedAt,
    }),
  );
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("IndexedDB 打开失败"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onerror = () => reject(request.error || new Error("IndexedDB 读取失败"));
    request.onsuccess = () => resolve(request.result || null);
  });
}

function idbSet(db, key, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB 写入失败"));
    transaction.oncomplete = () => resolve();
    transaction.objectStore(STORE_NAME).put(value, key);
  });
}

function normalizeRuntimeConfig(source = {}) {
  const backendBaseUrl = normalizeBaseUrl(source.backendBaseUrl);
  return {
    backendBaseUrl,
    aiApiBaseUrl: normalizeBaseUrl(source.aiApiBaseUrl) || backendBaseUrl,
    cloudSyncBaseUrl: normalizeBaseUrl(source.cloudSyncBaseUrl) || backendBaseUrl,
  };
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  return text;
}

function isFileContext() {
  return window.location.protocol === "file:";
}

function isLoopbackHost() {
  return ["127.0.0.1", "localhost"].includes(window.location.hostname);
}

function isGitHubPagesHost() {
  return !isFileContext() && /\.github\.io$/i.test(window.location.hostname);
}

function supportsSameOriginHostedApis() {
  return !isFileContext() && !isLoopbackHost() && !isGitHubPagesHost();
}

function hasConfiguredAiApi() {
  return Boolean(RUNTIME_CONFIG.aiApiBaseUrl);
}

function hasAiApiSupport() {
  return isFileContext() || isLoopbackHost() || hasConfiguredAiApi() || supportsSameOriginHostedApis();
}

function hasConfiguredCloudSync() {
  return Boolean(RUNTIME_CONFIG.cloudSyncBaseUrl);
}

function hasCloudSyncSupport() {
  return isFileContext() || isLoopbackHost() || hasConfiguredCloudSync() || supportsSameOriginHostedApis();
}

function getAiApiUrl(path) {
  if (isFileContext()) {
    return `${LOCAL_PROXY_ORIGIN}${path}`;
  }
  if (hasConfiguredAiApi()) {
    return `${RUNTIME_CONFIG.aiApiBaseUrl}${path}`;
  }
  return path;
}

function getCloudApiUrl(path) {
  if (isFileContext()) {
    return `${LOCAL_PROXY_ORIGIN}${path}`;
  }
  if (hasConfiguredCloudSync()) {
    return `${RUNTIME_CONFIG.cloudSyncBaseUrl}${path}`;
  }
  return path;
}

function getDefaultCloudSyncDetail() {
  if (!hasCloudSyncSupport()) {
    return "当前入口默认只保留浏览器本地错题；如果还想跨设备同步，请在 site-config.js 里配置 backendBaseUrl 或 cloudSyncBaseUrl。";
  }
  return "登录同一个同步账号后，这个错题库会自动备份到云端，浏览器丢缓存也能找回来。";
}

function setCloudSyncStatus(message, tone = "info", detail = "") {
  state.cloud.statusMessage = message;
  state.cloud.statusTone = tone;
  state.cloud.statusDetail = detail || getDefaultCloudSyncDetail();
  renderCloudSyncUi();
}

function resetCloudSyncSession(options = {}) {
  const {
    message = "未登录",
    tone = "info",
    detail = getDefaultCloudSyncDetail(),
    clearAccountInput = false,
  } = options;
  if (cloudSyncTimer) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
  }
  state.cloud.accountId = "";
  state.cloud.token = "";
  state.cloud.lastSyncedAt = 0;
  state.cloud.syncing = false;
  persistCloudSyncSession();
  if (els.cloudPassword) {
    els.cloudPassword.value = "";
  }
  if (clearAccountInput && els.cloudAccount) {
    els.cloudAccount.value = "";
  }
  setCloudSyncStatus(message, tone, detail);
}

function createCloudRequestError(message, status = 500, code = "cloud_sync_error") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function isCloudSessionError(error) {
  return Number(error?.status || 0) === 401;
}

async function requestCloudJson(path, options = {}) {
  if (!hasCloudSyncSupport()) {
    throw createCloudRequestError(getDefaultCloudSyncDetail(), 400, "cloud_sync_unconfigured");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (state.cloud.token && !headers.has("X-Cloud-Session")) {
    headers.set("X-Cloud-Session", state.cloud.token);
  }

  const response = await fetch(getCloudApiUrl(path), {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createCloudRequestError(payload.error || "云端同步服务暂时不可用。", response.status, payload.code);
  }
  return payload;
}

function hasMeaningfulState(snapshot = buildStateSnapshot()) {
  return Boolean(
    (snapshot.entries || []).length ||
      (snapshot.selectedIds || []).length ||
      snapshot.latestAiReview,
  );
}

function getSnapshotUpdatedAt(snapshot = buildStateSnapshot()) {
  return Number(snapshot?.updatedAt || snapshot?.meta?.updatedAt || 0) || 0;
}

function applySnapshot(snapshot = {}) {
  state.updatedAt = getSnapshotUpdatedAt(snapshot);
  state.entries = Array.isArray(snapshot.entries) ? snapshot.entries.map(normalizeImportedEntry) : [];
  state.selectedIds = Array.isArray(snapshot.selectedIds) ? snapshot.selectedIds.filter(Boolean) : [];
  state.latestAiReview = snapshot.latestAiReview || null;
}

async function applyCloudRemoteSnapshot(remoteSnapshot, updatedAt, options = {}) {
  applySnapshot({
    ...remoteSnapshot,
    updatedAt: updatedAt || getSnapshotUpdatedAt(remoteSnapshot),
  });
  await saveSnapshot(buildStateSnapshot());
  state.cloud.lastSyncedAt = Math.max(Number(updatedAt || 0) || 0, state.updatedAt || 0);
  persistCloudSyncSession();
  hydrateQuestionTypeFilter();
  hydrateCauseFilter();
  renderAll();
  if (options.announceMessage) {
    updateFormStatus(options.announceMessage);
  }
}

function handleCloudSessionExpired(error) {
  resetCloudSyncSession({
    message: "登录已失效",
    tone: "warning",
    detail: error?.message || "云端同步账号已经失效，请重新登录。",
  });
}

async function fetchCloudProgressSnapshot() {
  if (!state.cloud.token) {
    return null;
  }
  return requestCloudJson("/api/cloud-sync/state", {
    method: "GET",
  });
}

async function pushCloudProgressSnapshot(snapshot = buildStateSnapshot(), options = {}) {
  if (!hasCloudSyncSupport() || !state.cloud.token || cloudSyncInFlight) {
    return false;
  }

  cloudSyncInFlight = true;
  state.cloud.syncing = true;
  setCloudSyncStatus("同步中", "info", `正在把这份记录存到账号“${state.cloud.accountId}”里。`);

  try {
    const payload = await requestCloudJson("/api/cloud-sync/state", {
      method: "POST",
      body: JSON.stringify({
        state: snapshot,
        updatedAt: getSnapshotUpdatedAt(snapshot) || Date.now(),
      }),
    });

    if (payload?.state && payload.conflict) {
      await applyCloudRemoteSnapshot(payload.state, payload.updatedAt, {
        announceMessage: "云端那边有更新一些的版本，已经替你切过去了。",
      });
      setCloudSyncStatus("已同步", "success", `云端那边有更新一些的版本，已经替你切过去了。`);
      return true;
    }

    if (payload?.state) {
      applySnapshot(payload.state);
      await saveSnapshot(buildStateSnapshot());
    }

    state.cloud.lastSyncedAt = Number(payload?.updatedAt || getSnapshotUpdatedAt(snapshot) || Date.now()) || Date.now();
    persistCloudSyncSession();
    setCloudSyncStatus("已同步", "success", `这台设备和账号“${state.cloud.accountId}”里的记录已经对上了。`);
    if (options.announceMessage) {
      updateFormStatus(options.announceMessage);
    }
    renderAll();
    return true;
  } catch (error) {
    if (isCloudSessionError(error)) {
      handleCloudSessionExpired(error);
    } else {
      setCloudSyncStatus("同步失败", "danger", error?.message || "云端同步暂时不可用，请稍后再试。");
    }
    return false;
  } finally {
    state.cloud.syncing = false;
    cloudSyncInFlight = false;
    renderCloudSyncUi();
  }
}

function scheduleCloudProgressSync() {
  if (!state.cloud.token || !hasCloudSyncSupport()) {
    return;
  }

  if (cloudSyncTimer) {
    clearTimeout(cloudSyncTimer);
  }

  setCloudSyncStatus("待同步", "warning", `你刚改过内容，系统会稍后自动同步到账号“${state.cloud.accountId}”。`);
  cloudSyncTimer = setTimeout(() => {
    cloudSyncTimer = null;
    pushCloudProgressSnapshot(buildStateSnapshot());
  }, CLOUD_SYNC_DELAY);
}

async function syncCloudProgressOnStartup(options = {}) {
  if (!hasCloudSyncSupport()) {
    setCloudSyncStatus("本地模式", "info", getDefaultCloudSyncDetail());
    return;
  }

  if (!state.cloud.token) {
    setCloudSyncStatus("未登录", "info", getDefaultCloudSyncDetail());
    renderCloudSyncUi();
    return;
  }

  state.cloud.syncing = true;
  setCloudSyncStatus("连接中", "info", `正在看看账号“${state.cloud.accountId}”里有没有更新一些的记录。`);

  try {
    const remotePayload = await fetchCloudProgressSnapshot();
    if (remotePayload?.accountId) {
      state.cloud.accountId = String(remotePayload.accountId || state.cloud.accountId).trim().toLowerCase();
      persistCloudSyncSession();
    }

    const remoteSnapshot = remotePayload?.state && typeof remotePayload.state === "object" ? remotePayload.state : null;
    const remoteUpdatedAt = Math.max(Number(remotePayload?.updatedAt || 0) || 0, getSnapshotUpdatedAt(remoteSnapshot));
    const localUpdatedAt = getSnapshotUpdatedAt(buildStateSnapshot());

    if (remoteSnapshot && remoteUpdatedAt > localUpdatedAt) {
      await applyCloudRemoteSnapshot(remoteSnapshot, remoteUpdatedAt, {
        announceMessage: options.announceMessage || "已经从云端拉回更新一些的记录。",
      });
      setCloudSyncStatus("已同步", "success", `已经从账号“${state.cloud.accountId}”拉回更新一些的记录。`);
      return;
    }

    if (localUpdatedAt > remoteUpdatedAt || (hasMeaningfulState(buildStateSnapshot()) && !remoteUpdatedAt)) {
      await pushCloudProgressSnapshot(buildStateSnapshot(), {
        announceMessage: options.announceMessage || "这份记录已经同步到云端。",
      });
      return;
    }

    state.cloud.lastSyncedAt = remoteUpdatedAt || state.cloud.lastSyncedAt || Date.now();
    persistCloudSyncSession();
    setCloudSyncStatus("已同步", "success", `这台设备和账号“${state.cloud.accountId}”里的记录已经对上了。`);
  } catch (error) {
    if (isCloudSessionError(error)) {
      handleCloudSessionExpired(error);
    } else {
      setCloudSyncStatus("连接失败", "danger", error?.message || "暂时连不上云端同步服务，请稍后再试。");
    }
  } finally {
    state.cloud.syncing = false;
    renderCloudSyncUi();
  }
}

async function handleCloudAuth(action) {
  if (!hasCloudSyncSupport()) {
    setCloudSyncStatus("本地模式", "info", getDefaultCloudSyncDetail());
    return;
  }

  const accountId = els.cloudAccount?.value?.trim() || "";
  const password = els.cloudPassword?.value || "";
  if (!accountId) {
    setCloudSyncStatus("等待输入", "warning", "先填一个同步账号，再去注册或登录。");
    return;
  }
  if (!password) {
    setCloudSyncStatus("等待输入", "warning", "还差同步口令。注册和登录都需要同一套口令。");
    return;
  }

  state.cloud.syncing = true;
  setCloudSyncStatus(
    action === "register" ? "注册中" : "登录中",
    "info",
    action === "register"
      ? "正在创建你的云端同步账号，并准备把当前错题档案推上去。"
      : "正在登录云端同步账号，并准备对比本地和云端哪一份更新。",
  );

  try {
    const payload = await requestCloudJson("/api/cloud-sync/auth", {
      method: "POST",
      body: JSON.stringify({
        action,
        accountId,
        password,
      }),
    });

    state.cloud.accountId = String(payload.accountId || accountId).trim().toLowerCase();
    state.cloud.token = String(payload.token || "").trim();
    state.cloud.lastSyncedAt = 0;
    persistCloudSyncSession();
    if (els.cloudPassword) {
      els.cloudPassword.value = "";
    }
    renderCloudSyncUi();

    await syncCloudProgressOnStartup({
      announceMessage:
        action === "register" ? "账号已经建好，现在开始同步这边的记录。" : "已经登录，正在对一下本地和云端哪份更新一些。",
    });
  } catch (error) {
    state.cloud.syncing = false;
    setCloudSyncStatus(action === "register" ? "注册失败" : "登录失败", "danger", error?.message || "云端同步账号暂时不可用，请稍后再试。");
    renderCloudSyncUi();
  }
}

async function handleCloudLogout() {
  if (!hasCloudSyncSupport()) {
    setCloudSyncStatus("本地模式", "info", getDefaultCloudSyncDetail());
    return;
  }

  if (!state.cloud.token) {
    setCloudSyncStatus("未登录", "info", getDefaultCloudSyncDetail());
    return;
  }

  const currentAccount = state.cloud.accountId;
  state.cloud.syncing = true;
  renderCloudSyncUi();

  try {
    await requestCloudJson("/api/cloud-sync/auth", {
      method: "POST",
      body: JSON.stringify({
        action: "logout",
        token: state.cloud.token,
      }),
    });
  } catch {
    // Remote logout failure should not block local logout.
  } finally {
    resetCloudSyncSession({
      message: "已退出",
      tone: "info",
      detail: currentAccount
        ? `已退出云端账号“${currentAccount}”。本地缓存还在，你之后重新登录就能继续同步。`
        : getDefaultCloudSyncDetail(),
    });
  }
}

function formatDateTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleString("zh-CN", {
      hour12: false,
    });
  } catch {
    return "尚未同步";
  }
}

function parseTagInput(value) {
  return uniqueValues(
    String(value || "")
      .split(/[,，/]/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function uniqueValues(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function truncate(text, length) {
  const string = String(text || "");
  if (string.length <= length) {
    return string;
  }
  return `${string.slice(0, length - 1)}…`;
}

function createId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function updateFormStatus(message, isError = false) {
  els.formStatus.textContent = message;
  els.formStatus.style.color = isError ? "var(--danger)" : "";
}

function renderEmptyState(title, text) {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
