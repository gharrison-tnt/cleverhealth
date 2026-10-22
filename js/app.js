import { h } from './ui.js';
import * as data from './data.js';
import { renderPortfolio } from './views/portfolio.js';
import { renderAccount } from './views/account.js';
import { renderAssess } from './views/assess.js';
import { renderConfig } from './views/config.js';

const main = document.getElementById('main');

async function route() {
  const [, view, a, b] = (location.hash || '#/').split('/');
  document.querySelectorAll('.nav a').forEach((n) => n.classList.toggle('active', (n.dataset.view || '') === (view || '')));
  main.replaceChildren();
  try {
    if (view === 'account') await renderAccount(main, a, b);
    else if (view === 'assess') renderAssess(main);
    else if (view === 'config') renderConfig(main, a);
    else await renderPortfolio(main);
  } catch (e) {
    main.replaceChildren(h('div', { class: 'error-box' }, `Something went wrong: ${e.message}`));
    console.error(e);
  }
  if (!route.keepScroll) window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', route);
data.init().then(route).catch((e) => {
  main.replaceChildren(h('div', { class: 'error-box' }, `Could not load configuration: ${e.message}`));
});
