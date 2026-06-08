(function () {
  const APP_META = {
    name: "Pixelmon - Pokelist",
    version: "1.0.7",
    releaseUrl: "https://github.com/GabrielMWalker/CustomPokeDex/releases",
    updaterUrl: "https://github.com/GabrielMWalker/CustomPokeDex/releases/latest/download/latest.json"
  };

  function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function createStatusBlock(title, detail, className = "settings-status") {
    const status = document.createElement("div");
    status.className = className;
    const strong = document.createElement("strong");
    strong.textContent = title;
    const span = document.createElement("span");
    span.textContent = detail;
    status.append(strong, span);
    return status;
  }

  function appendProgressiveItems({
    container,
    items,
    renderItem,
    batchSize = 90,
    buttonLabel = "Mostrar mais"
  }) {
    let nextIndex = 0;
    let observer = null;
    const sentinel = document.createElement("div");
    sentinel.className = "progressive-list-sentinel";

    const button = document.createElement("button");
    button.className = "muted-button progressive-list-button";
    button.type = "button";
    sentinel.append(button);

    function appendNextBatch() {
      const end = Math.min(nextIndex + batchSize, items.length);
      const fragment = document.createDocumentFragment();
      items.slice(nextIndex, end).forEach(item => fragment.append(renderItem(item)));
      container.append(fragment);
      nextIndex = end;

      const remaining = items.length - nextIndex;
      button.textContent = `${buttonLabel} (${remaining})`;
      if (remaining <= 0) {
        if (observer) observer.disconnect();
        sentinel.remove();
      }
    }

    appendNextBatch();
    if (nextIndex >= items.length) return;

    container.after(sentinel);
    button.addEventListener("click", appendNextBatch);

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) appendNextBatch();
      }, { rootMargin: "320px 0px" });
      observer.observe(sentinel);
    }
  }

  window.POKELIST_APP_META = APP_META;
  window.POKELIST_UTILS = {
    appendProgressiveItems,
    createStatusBlock,
    downloadTextFile
  };
})();
