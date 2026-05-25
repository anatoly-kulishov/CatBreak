function showUpdateModal(payload) {
  const title = document.getElementById("update-modal-title");
  const detail = document.getElementById("update-modal-detail");
  const actionsEl = document.getElementById("update-modal-actions");
  if (!title || !detail || !actionsEl || !payload) return;

  title.textContent = payload.title || "";
  detail.textContent = payload.detail || "";
  actionsEl.replaceChildren();

  for (const action of payload.actions || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label;
    btn.className = action.primary
      ? "update-modal__btn update-modal__btn--primary"
      : "update-modal__btn";
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
  showUpdateModal(payload);
});
