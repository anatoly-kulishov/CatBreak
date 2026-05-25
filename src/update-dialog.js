function showUpdatePrompt(payload) {
  const title = document.getElementById("update-prompt-title");
  const detail = document.getElementById("update-prompt-detail");
  const actionsEl = document.getElementById("update-prompt-actions");
  if (!title || !detail || !actionsEl || !payload) return;

  title.textContent = payload.title || "";
  detail.textContent = payload.detail || "";
  actionsEl.replaceChildren();

  for (const action of payload.actions || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label;
    btn.className = action.primary
      ? "update-prompt__btn update-prompt__btn--primary"
      : "update-prompt__btn";
    btn.addEventListener("click", async () => {
      try {
        await window.catBreak?.updateDialogAction?.(action.id);
      } catch (err) {
        console.error(err);
      }
    });
    actionsEl.appendChild(btn);
  }
}

window.catBreak?.onUpdateDialog?.((payload) => {
  showUpdatePrompt(payload);
});
