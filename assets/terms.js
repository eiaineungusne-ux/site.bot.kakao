/* Read the same Markdown file that Sveltia CMS edits. No hosting build required. */
(async () => {
  const article = document.querySelector("[data-terms-source]");
  if (!article) return;
  const status = document.getElementById("terms-status");
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let source;
    try {
      const response = await fetch(article.dataset.termsSource, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      source = await response.text();
    } finally {
      clearTimeout(timeout);
    }
    const match = source
      .replace(/^\uFEFF/, "")
      .match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/);
    if (!match) throw new Error("Invalid Markdown document");
    const meta = jsyaml.load(match[1], { schema: jsyaml.JSON_SCHEMA });
    if (
      meta.bot !== article.dataset.bot ||
      typeof meta.title !== "string" ||
      !match[2].trim()
    ) {
      throw new Error("Unexpected terms document");
    }
    const date = (value) => {
      const text = String(value ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text))
        throw new Error("Invalid document date");
      return text.replaceAll("-", ".");
    };
    const dates = `시행일 ${date(meta.effective_date)} · 최종 수정 ${date(meta.updated)}`;
    const html = DOMPurify.sanitize(marked.parse(match[2]), {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["style", "form", "input", "button", "iframe"],
      FORBID_ATTR: ["style"],
    });
    document.getElementById("terms-content").innerHTML = html;
    document.getElementById("terms-title").textContent = meta.title;
    document.getElementById("terms-dates").textContent = dates;
    document.title = `${meta.title} | Venta × Void`;
    article.dataset.loaded = "true";
    status.hidden = true;
  } catch (error) {
    status.hidden = false;
    status.textContent =
      "최신 약관을 불러오지 못해 저장된 내용을 표시합니다. 다시 새로고침하거나 구매 문의로 최신 약관을 확인해 주세요.";
    console.error("Unable to load current terms:", error);
  }
})();
