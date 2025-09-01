function showModal(message) {
  const modal = document.getElementById("customAlertModal");
  const messageBox = document.getElementById("customAlertMessage");
  const closeBtn = document.getElementById("customAlertCloseBtn");

  if (!modal || !messageBox || !closeBtn) return;

  messageBox.textContent = message;
  modal.style.display = "flex";

  closeBtn.onclick = () => {
    modal.style.display = "none";
  };

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") modal.style.display = "none";
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });
}
