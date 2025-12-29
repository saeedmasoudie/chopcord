(function () {
  if (!window.pywebview) return;

  const STYLE = `
  #cc-update-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    animation: ccFadeIn .25s ease-out forwards;
  }

  #cc-update-modal {
    background: #0f1115;
    color: #fff;
    padding: 24px;
    border-radius: 14px;
    width: 380px;
    box-shadow: 0 20px 40px rgba(0,0,0,.6);
    transform: scale(.9);
    opacity: 0;
    animation: ccPopIn .25s ease-out forwards;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  }

  #cc-update-modal h2 {
    margin: 0 0 8px;
    font-size: 20px;
  }

  #cc-update-modal p {
    margin: 0 0 20px;
    color: #c7c7c7;
    line-height: 1.4;
  }

  #cc-update-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  #cc-update-actions button {
    padding: 8px 14px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    font-size: 14px;
  }

  #cc-update-later {
    background: #2b2d31;
    color: #ddd;
  }

  #cc-update-later:hover {
    background: #35373c;
  }

  #cc-update-open {
    background: #5865f2;
    color: white;
  }

  #cc-update-open:hover {
    background: #4752c4;
  }

  @keyframes ccFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes ccPopIn {
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  `;

  function injectStyle() {
    if (document.getElementById("cc-update-style")) return;
    const s = document.createElement("style");
    s.id = "cc-update-style";
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function closeModal() {
    const o = document.getElementById("cc-update-overlay");
    if (o) o.remove();
  }

  function createModal(version) {
    injectStyle();

    const overlay = document.createElement("div");
    overlay.id = "cc-update-overlay";

    const modal = document.createElement("div");
    modal.id = "cc-update-modal";

    modal.innerHTML = `
      <h2>Update Available</h2>
      <p>Chopcord <b>${version}</b> is available.<br/>Would you like to update now?</p>
      <div id="cc-update-actions">
        <button id="cc-update-later">Later</button>
        <button id="cc-update-open">Update</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById("cc-update-later").onclick = closeModal;
    document.getElementById("cc-update-open").onclick = () => {
      window.pywebview.api.open_update_page();
      closeModal();
    };

    overlay.addEventListener("click", e => {
      if (e.target === overlay) closeModal();
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") closeModal();
    }, { once: true });
  }

  function check() {
    window.pywebview.api.get_update_status()
      .then(status => {
        if (status && status.available) {
          createModal(status.version);
        }
      })
      .catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", check);
  } else {
    check();
  }
})();
