/* Companion controls live in an accessible dialog, beside the daily journey. */
(() => {
  const dialog = document.querySelector('#companionDialog');
  const openButton = document.querySelector('#companionOpen');
  if (!dialog || !openButton) return;
  openButton.addEventListener('click', () => dialog.showModal());
  document.querySelector('#companionClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.querySelectorAll('[data-page],#petOutfit').forEach(button => button.addEventListener('click', () => dialog.close()));
})();
