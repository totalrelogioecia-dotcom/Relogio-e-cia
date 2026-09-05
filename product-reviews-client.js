(() => {
  'use strict';

  const root = document.getElementById('product-page');
  if (!root) return;
  const productId = Number(new URLSearchParams(location.search).get('id'));
  if (!Number.isFinite(productId) || productId <= 0) return;
  let mounted = false;
  let reviewFilter = 'all';
  let reviewSort = 'newest';
  let currentReviews = [];
  let currentSummary = {};
  let currentEligibility = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const date = value => {
    const parsed = new Date(value || 0);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('pt-BR');
  };
  const stars = value => {
    const rating = Math.max(0, Math.min(5, Number(value) || 0));
    return `${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))}`;
  };

  async function json(url, options = {}) {
    const response = await fetch(url, { ...options, cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as avaliações.');
    return data;
  }

  function scoreHtml(summary) {
    const count = Number(summary?.count || 0);
    const average = Number(summary?.average || 0);
    return `<div class="product-review-score"><strong>${count ? average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}</strong><span class="review-stars" aria-label="${count ? `${average} de 5 estrelas` : 'Sem avaliações'}">${count ? stars(average) : '☆☆☆☆☆'}</span><small>${count ? `${count} avaliação${count === 1 ? '' : 'ões'} publicada${count === 1 ? '' : 's'}` : 'Ainda sem avaliações publicadas'}</small></div>`;
  }

  function listHtml(reviews) {
    if (!reviews.length) {
      if (reviewFilter !== 'all') return '<div class="product-review-empty">Nenhuma avaliação encontrada com esta nota.</div>';
      return '<div class="product-review-empty">Ainda não há avaliações publicadas para este produto.</div>';
    }
    return `<div class="product-review-list">${reviews.map(review => `<article class="product-review-card"><div class="product-review-head"><div><div class="product-review-author"><strong>${esc(review.author_name || 'Cliente')}</strong><span class="verified-review-badge">✓ Compra verificada</span></div><span class="product-review-date">${date(review.created_at)}</span></div><span class="product-review-stars" aria-label="${Number(review.rating)} de 5 estrelas">${stars(review.rating)}</span></div>${review.title ? `<div class="product-review-title">${esc(review.title)}</div>` : ''}<div class="product-review-comment">${esc(review.comment || '')}</div></article>`).join('')}</div>`;
  }

  function controlsHtml() {
    return `<div class="product-review-controls" aria-label="Filtros das avaliações">
      <label>Filtrar por nota
        <select id="product-review-filter">
          <option value="all"${reviewFilter === 'all' ? ' selected' : ''}>Todas as avaliações</option>
          <option value="5"${reviewFilter === '5' ? ' selected' : ''}>5 estrelas</option>
          <option value="4"${reviewFilter === '4' ? ' selected' : ''}>4 estrelas</option>
          <option value="3"${reviewFilter === '3' ? ' selected' : ''}>3 estrelas</option>
          <option value="2"${reviewFilter === '2' ? ' selected' : ''}>2 estrelas</option>
          <option value="1"${reviewFilter === '1' ? ' selected' : ''}>1 estrela</option>
        </select>
      </label>
      <label>Ordenar
        <select id="product-review-sort">
          <option value="newest"${reviewSort === 'newest' ? ' selected' : ''}>Mais recentes</option>
          <option value="oldest"${reviewSort === 'oldest' ? ' selected' : ''}>Mais antigas</option>
          <option value="highest"${reviewSort === 'highest' ? ' selected' : ''}>Maior nota</option>
          <option value="lowest"${reviewSort === 'lowest' ? ' selected' : ''}>Menor nota</option>
        </select>
      </label>
    </div>`;
  }

  function filteredReviews() {
    const filtered = reviewFilter === 'all'
      ? [...currentReviews]
      : currentReviews.filter(review => Math.round(Number(review.rating) || 0) === Number(reviewFilter));
    const timestamp = review => new Date(review.created_at || 0).getTime() || 0;
    filtered.sort((a, b) => {
      if (reviewSort === 'oldest') return timestamp(a) - timestamp(b);
      if (reviewSort === 'highest') return Number(b.rating || 0) - Number(a.rating || 0) || timestamp(b) - timestamp(a);
      if (reviewSort === 'lowest') return Number(a.rating || 0) - Number(b.rating || 0) || timestamp(b) - timestamp(a);
      return timestamp(b) - timestamp(a);
    });
    return filtered;
  }

  function ratingInputs(current = 5) {
    return [1, 2, 3, 4, 5].map(value => `<label><input type="radio" name="review-rating" value="${value}" ${Number(current) === value ? 'checked' : ''}><span>${value} ★</span></label>`).join('');
  }

  function formHtml(eligibility) {
    if (!eligibility?.authenticated || !eligibility?.eligible) return '';
    const existing = eligibility.existing_review || null;
    const statusText = existing?.status === 'approved'
      ? 'Sua avaliação está publicada. Se editar, ela volta para moderação antes de aparecer novamente.'
      : existing?.status === 'pending'
        ? 'Sua avaliação está aguardando moderação. Você pode atualizá-la enquanto isso.'
        : existing?.status === 'rejected'
          ? 'Sua avaliação anterior não foi publicada. Você pode ajustá-la e enviar novamente.'
          : 'Sua compra foi verificada. Conte como foi sua experiência com este produto.';
    return `<div class="product-review-form-wrap"><h3>${existing ? 'Sua avaliação' : 'Avalie sua compra'}</h3><p>${esc(statusText)}</p><form class="product-review-form" id="verified-review-form"><fieldset class="product-review-rating"><legend>Nota</legend>${ratingInputs(existing?.rating || 5)}</fieldset><label>Título <input type="text" id="review-title" maxlength="80" value="${esc(existing?.title || '')}" placeholder="Ex.: Excelente relógio"></label><label>Comentário <textarea id="review-comment" maxlength="900" required placeholder="Conte o que achou do produto, acabamento, conforto e uso no dia a dia.">${esc(existing?.comment || '')}</textarea></label><div class="product-review-actions"><button class="btn btn-primary" type="submit">${existing ? 'Atualizar avaliação' : 'Enviar avaliação'}</button><span class="product-review-message" id="product-review-message" aria-live="polite"></span></div></form></div>`;
  }

  function bindReviewControls() {
    document.getElementById('product-review-filter')?.addEventListener('change', event => {
      reviewFilter = event.currentTarget.value;
      renderReviews();
    });
    document.getElementById('product-review-sort')?.addEventListener('change', event => {
      reviewSort = event.currentTarget.value;
      renderReviews();
    });
    document.getElementById('verified-review-form')?.addEventListener('submit', submitReview);
  }

  function renderReviews() {
    const host = document.querySelector('#product-reviews [data-product-reviews-host]');
    if (!host) return;
    host.innerHTML = `<div class="product-reviews-summary">${scoreHtml(currentSummary)}${controlsHtml()}</div>${listHtml(filteredReviews())}${formHtml(currentEligibility)}`;
    bindReviewControls();
  }

  async function submitReview(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const message = document.getElementById('product-review-message');
    const rating = Number(form.querySelector('input[name="review-rating"]:checked')?.value || 0);
    const title = String(document.getElementById('review-title')?.value || '').trim();
    const comment = String(document.getElementById('review-comment')?.value || '').trim();
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Enviando...';
    message.textContent = '';
    message.className = 'product-review-message';
    try {
      const data = await json('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, rating, title, comment })
      });
      message.textContent = data.message || 'Avaliação recebida.';
      message.className = 'product-review-message success';
      await loadReviews();
    } catch (error) {
      message.textContent = error.message;
      message.className = 'product-review-message error';
      button.disabled = false;
      button.textContent = old;
    }
  }

  async function loadReviews() {
    const section = document.getElementById('product-reviews');
    if (!section) return;
    const host = section.querySelector('[data-product-reviews-host]');
    if (!host) return;
    host.innerHTML = '<div class="product-review-empty">Carregando avaliações...</div>';
    try {
      const [publicData, eligibility] = await Promise.all([
        json(`/api/reviews?product_id=${encodeURIComponent(productId)}`),
        json(`/api/reviews/eligibility?product_id=${encodeURIComponent(productId)}`)
      ]);
      currentReviews = Array.isArray(publicData.reviews) ? publicData.reviews : [];
      currentSummary = publicData.summary || {};
      currentEligibility = eligibility;
      renderReviews();
    } catch (error) {
      host.innerHTML = `<div class="product-review-empty">${esc(error.message)}</div>`;
    }
  }

  function mount() {
    if (mounted || !root.querySelector('.product-hero')) return;
    const related = root.querySelector('.related-section');
    const section = document.createElement('section');
    section.id = 'product-reviews';
    section.className = 'product-content-section product-reviews-section';
    section.innerHTML = '<div class="product-section-label"><p class="eyebrow">Avaliações</p><h2>Compras verificadas</h2></div><div class="product-section-body"><div class="product-reviews-wrap" data-product-reviews-host></div></div>';
    if (related) related.insertAdjacentElement('beforebegin', section);
    else root.appendChild(section);
    mounted = true;
    loadReviews();
  }

  const observer = new MutationObserver(mount);
  observer.observe(root, { childList: true, subtree: true });
  mount();
})();
