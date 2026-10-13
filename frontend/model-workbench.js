/* Keep controls beside the exhibit, using existing model events and lifecycle. */
(() => {
  const cleanups = new WeakMap();
  window.FufuWorkbench = {
    tabs(container, panels, mobileStage) {
      cleanups.get(container)?.();
      const bar = document.createElement('div');
      bar.className = 'model-control-tabs';
      bar.setAttribute('role', 'tablist');
      bar.setAttribute('aria-label', '模型观察方式');
      const buttons = panels.map(({label, node}, index) => {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = label;
        button.id = `${container.id || 'model'}-tab-${index}`;
        node.id ||= `${container.id || 'model'}-panel-${index}`;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', node.id);
        node.setAttribute('role', 'tabpanel');
        node.setAttribute('aria-labelledby', button.id);
        button.addEventListener('click', () => activate(index));
        button.addEventListener('keydown', event => {
          let next;
          if (event.key === 'ArrowRight') next = (index + 1) % panels.length;
          if (event.key === 'ArrowLeft') next = (index + panels.length - 1) % panels.length;
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = panels.length - 1;
          if (next === undefined) return;
          event.preventDefault(); activate(next); buttons[next].focus();
        });
        bar.append(button); return button;
      });
      function activate(index) {
        panels.forEach(({node}, i) => {
          node.hidden = i !== index;
          buttons[i].setAttribute('aria-selected', String(i === index));
          buttons[i].tabIndex = i === index ? 0 : -1;
        });
      }
      container.replaceChildren(bar, ...panels.map(({node}) => node));
      activate(0);
      if (mobileStage) {
        const mobile = matchMedia('(max-width:650px)');
        const place = () => mobile.matches ? mobileStage.append(bar) : container.prepend(bar);
        mobile.addEventListener('change', place); place();
        cleanups.set(container, () => { mobile.removeEventListener('change', place); bar.remove(); });
      }
    },
  };
  const page = document.querySelector('#page-jurassic');
  if (!page) return;
  const stage = page.querySelector('.dino-hero');
  const roster = page.querySelector('.dino-roster');
  const layout = page.querySelector('.dino-layout');
  const workspace = document.createElement('div'); workspace.className = 'dino-workbench';
  stage.before(workspace); workspace.append(stage, roster);
  roster.prepend(stage.querySelector('.dino-habitats'));
  layout.classList.add('dino-details');
})();
