'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function node() {
  const classes = new Set();
  return {
    dataset: {}, attributes: {}, events: {}, innerHTML: '', textContent: '', children: [],
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name)
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) {
      delete this.attributes[name];
      delete this.dataset[name.replace(/^data-/, '').replace(/-([a-z])/g, (_, char) => char.toUpperCase())];
    },
    addEventListener(name, callback) { this.events[name] = callback; },
    appendChild(child) { this.children.push(child); child.parentNode = this; },
    insertBefore(child) { this.appendChild(child); }
  };
}

function availabilityFixture(fetchResponse) {
  const products = [1, 2, 3, 4, 5].map(id => ({ id, nome: `Relógio ${id}`, sku: `SKU-${id}`, estoque: id === 1 ? 1 : 0 }));
  const cards = [];
  const buttons = [];
  for (const kind of ['product-card', 'home-watch-card']) {
    for (const product of products) {
      const card = node();
      card.kind = kind;
      const actions = node();
      const body = kind === 'home-watch-card' ? node() : card;
      body.appendChild(actions);
      if (body !== card) card.appendChild(body);
      card.querySelector = selector => {
        if (selector === '.catalog-availability') return body.children.find(child => child.className?.startsWith('catalog-availability'));
        return selector.split(',').map(value => value.trim()).includes(kind === 'home-watch-card' ? '.home-watch-actions' : '.card-actions') ? actions : null;
      };
      const button = node();
      button.dataset.addCarrinho = String(product.id);
      button.closest = selector => selector.split(',').map(value => value.trim()).includes(`.${kind}`) ? card : null;
      cards.push(card);
      buttons.push(button);
    }
  }
  const events = {};
  const document = {
    head: node(), createElement: node, getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => buttons,
    addEventListener: (name, callback) => { events[name] = callback; }
  };
  const context = { window: {}, document, PRODUTOS: products, fetch: fetchResponse, setTimeout() {} };
  vm.runInNewContext(read('catalog-availability.js'), context);
  return { api: context.window.RelogioCatalogAvailability, events, cards, buttons };
}

test('home e catálogo exibem as mesmas ações para estoque, encomenda, consulta e liberação', async () => {
  const calls = [];
  const fixture = availabilityFixture(async url => {
    calls.push(url);
    return { ok: true, json: async () => url.includes('product-details') ? {
      3: { disponibilidade: 'sob_encomenda', prazo_preparacao_dias_uteis: 20 },
      4: { disponibilidade: 'mediante_confirmacao' },
      5: { disponibilidade: 'mediante_confirmacao' }
    } : { items: [{ product_id: 5, purchase: { active: true } }] } };
  });
  await fixture.events.DOMContentLoaded();
  assert.deepEqual(calls, [], 'mostruários fechados não devem buscar disponibilidade');
  await Promise.all([fixture.api.prepare(), fixture.api.prepare()]);
  assert.equal(calls.length, 2, 'requisições concorrentes devem compartilhar o carregamento');
  fixture.api.decorate();

  const expected = ['Adicionar', 'Indisponível', 'Encomendar', 'Consultar disponibilidade', 'Adicionar liberado'];
  for (let index = 0; index < fixture.buttons.length; index++) {
    const button = fixture.buttons[index];
    assert.equal(button.textContent, expected[index % 5]);
    assert.equal(button.disabled, index % 5 === 1);
    assert.equal(button.dataset.confirmAvailability === '1', index % 5 === 3);
    const status = fixture.cards[index].querySelector('.catalog-availability');
    assert.ok(status, 'o status deve aparecer também dentro do corpo do card da home');
    if (index % 5 === 3) assert.match(status.innerHTML, /Disponibilidade sob consulta/);
    if (index % 5 === 2) assert.match(status.innerHTML, /20 dias úteis/);
  }
});

test('disponibilidade pode ser carregada novamente após falha da API', async () => {
  let unavailable = true;
  const fixture = availabilityFixture(async url => ({
    ok: !url.includes('product-details') || !unavailable,
    json: async () => ({})
  }));
  await assert.rejects(fixture.api.prepare(), /carregar a disponibilidade/);
  unavailable = false;
  await fixture.api.prepare();
});

test('consulta na home intercepta o clique antes de adicionar e registra o produto correto', async () => {
  const posts = [];
  const fixture = availabilityFixture(async (url, options) => {
    if (options?.method === 'POST') {
      posts.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ request: {} }) };
    }
    return { ok: true, json: async () => url.includes('product-details')
      ? { 4: { disponibilidade: 'mediante_confirmacao' } } : { items: [] } };
  });
  await fixture.api.prepare();
  fixture.api.decorate();
  const button = fixture.buttons[8];
  assert.equal(button.dataset.confirmAvailability, '1');
  let stopped = false;
  fixture.events.click({
    target: { closest: () => button }, preventDefault() {},
    stopImmediatePropagation() { stopped = true; }
  });
  await settle();
  assert.equal(stopped, true);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].product_id, 4);
  assert.equal(button.dataset.confirmRequestSent, '1');
});

function homeFixture(prepare) {
  const events = {};
  const panels = [];
  const rows = ['Casio', 'G-Shock'].map(marca => ({
    ...node(), href: `https://loja.example/produtos.html?marca=${marca}`,
    querySelector: () => null,
    insertAdjacentElement(position, panel) { panels.push(panel); }
  }));
  const document = {
    getElementById: () => null,
    querySelector: selector => selector === '#marcas .brand-index'
      ? { querySelectorAll: () => rows } : {},
    addEventListener: (name, callback) => { events[name] = callback; },
    createElement() {
      const panel = node();
      panel.track = node();
      const viewport = { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 };
      const prev = node();
      const next = node();
      panel.querySelector = selector => ({
        '.brand-showcase-track': panel.track,
        '.brand-showcase-viewport': viewport,
        '[data-carousel-prev]': prev, '[data-carousel-next]': next
      })[selector];
      return panel;
    }
  };
  const window = {
    location: { href: 'https://loja.example/' },
    matchMedia: () => ({ matches: true }), addEventListener() {},
    setTimeout() {}, requestAnimationFrame: callback => callback(),
    RelogioCatalogAvailability: { prepare, decorate() {} }
  };
  const PRODUTOS = rows.map((row, index) => ({
    id: index + 1, nome: `Modelo ${index}`, marca: index ? 'G-Shock' : 'Casio',
    categoria: 'Relógios', fotos: [`https://images.example/${index}.jpg`], estoque: 0
  }));
  vm.runInNewContext(read('home-enhancements.js'), { window, document, PRODUTOS, URL, quandoCatalogoPronto: callback => callback() });
  events.DOMContentLoaded();
  return { panels, rows, click: index => rows[index].events.click({ button: 0, preventDefault() {} }) };
}

test('fotos de cada marca são criadas só após abrir o mostruário e preservadas ao reabrir', async () => {
  let prepares = 0;
  const fixture = homeFixture(async () => { prepares++; });
  for (const panel of fixture.panels) {
    assert.doesNotMatch(panel.innerHTML + panel.track.innerHTML, /<img\b/);
  }
  assert.equal(prepares, 0);
  fixture.click(0);
  await settle();
  assert.match(fixture.panels[0].track.innerHTML, /<img\b/);
  assert.doesNotMatch(fixture.panels[1].track.innerHTML, /<img\b/);
  const markup = fixture.panels[0].track.innerHTML;
  fixture.click(0);
  fixture.click(0);
  await settle();
  assert.equal(prepares, 1);
  assert.equal(fixture.panels[0].track.innerHTML, markup);
});

test('mostruário mostra erro recuperável sem criar fotos quando a disponibilidade falha', async () => {
  let unavailable = true;
  const fixture = homeFixture(async () => { if (unavailable) throw new Error('offline'); });
  fixture.click(0);
  await settle();
  const panel = fixture.panels[0];
  assert.match(panel.track.innerHTML, /Tentar novamente/);
  assert.doesNotMatch(panel.track.innerHTML, /<img\b/);
  unavailable = false;
  panel.events.click({ target: { closest: selector => selector === '[data-showcase-retry]' ? {} : null } });
  await settle();
  assert.match(panel.track.innerHTML, /<img\b/);
  assert.equal(panel.track.attributes['aria-busy'], 'false');
});

function addressFixture(responses) {
  const elements = new Map();
  const events = {};
  const form = node();
  elements.set('shipping-box', { querySelector: () => form });
  const slot = node();
  elements.set('shipping-address-slot', slot);
  const retry = node();
  const document = {
    head: node(), getElementById: id => elements.get(id),
    addEventListener: (name, callback) => { events[name] = callback; },
    createElement() {
      const element = node();
      element.querySelector = () => retry;
      Object.defineProperty(element, 'innerHTML', {
        get() { return this.markup || ''; },
        set(value) {
          this.markup = value;
          for (const match of value.matchAll(/id="([^"]+)"/g)) {
            elements.set(match[1], { ...node(), dispatchEvent() {}, value: '' });
          }
        }
      });
      return element;
    }
  };
  slot.appendChild = element => { slot.children.push(element); elements.set(element.id, element); };
  const fetch = async () => {
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  };
  const storage = { getItem: () => null, setItem() {} };
  const context = {
    document, fetch, window: { fetch, dispatchEvent() {} }, localStorage: storage, sessionStorage: storage,
    CustomEvent: class {}, Event: class {}, setTimeout: callback => callback()
  };
  vm.runInNewContext(read('shipping-addresses.js'), context);
  events.DOMContentLoaded();
  return { elements, retry };
}

test('visitante recebe orientação para login no carrinho, mantendo a cotação por CEP', async () => {
  const fixture = addressFixture([{ ok: false, status: 401 }]);
  await settle();
  const markup = fixture.elements.get('shipping-address-picker').innerHTML;
  assert.match(markup, /Entrar ou criar conta/);
  assert.match(markup, /conta\.html\?voltar=carrinho\.html/);
  assert.match(markup, /calcular o frete pelo CEP/);
});

test('conta sem endereço é direcionada ao cadastro de endereços', async () => {
  const fixture = addressFixture([{ ok: true, json: async () => ({ addresses: [] }) }]);
  await settle();
  assert.match(fixture.elements.get('shipping-address-picker').innerHTML, /href="enderecos\.html"[^>]*>Cadastrar endereço/);
});

test('falha de endereços permite repetir e recuperar o seletor autenticado', async () => {
  const fixture = addressFixture([
    new Error('offline'),
    { ok: true, json: async () => ({ addresses: [{ id: 'a1', zip_code: '90000000', label: 'Casa', principal: true }] }) }
  ]);
  await settle();
  assert.match(fixture.elements.get('shipping-address-picker').innerHTML, /Tentar novamente/);
  await fixture.retry.events.click();
  const select = fixture.elements.get('shipping-address-select');
  assert.equal(select.children.length, 1);
  assert.equal(select.value, 'a1');
  assert.equal(fixture.elements.get('shipping-address-picker').attributes['aria-busy'], 'false');
});
