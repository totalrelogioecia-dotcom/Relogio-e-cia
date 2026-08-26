(() => {
  'use strict';

  if (typeof renderPhotoPreview !== 'function') return;

  let draggedIndex = null;

  function movePhoto(from, to) {
    const source = Number(from);
    const target = Number(to);
    if (!Number.isInteger(source) || !Number.isInteger(target)) return;
    if (source < 0 || source >= currentPhotos.length) return;
    if (target < 0 || target >= currentPhotos.length || source === target) return;

    const [photo] = currentPhotos.splice(source, 1);
    currentPhotos.splice(target, 0, photo);
    renderPhotoPreview();
  }

  function makePrimary(index) {
    const source = Number(index);
    if (!Number.isInteger(source) || source <= 0 || source >= currentPhotos.length) return;
    const [photo] = currentPhotos.splice(source, 1);
    currentPhotos.unshift(photo);
    renderPhotoPreview();
  }

  renderPhotoPreview = function renderOrderedPhotoPreview() {
    const box = document.querySelector('#photo-preview');
    if (!box) return;

    box.innerHTML = currentPhotos.map((src, i) => `
      <div class="photo-card photo-order-card" draggable="true" data-photo-index="${i}">
        <img src="${escAttr(src)}" alt="Foto ${i + 1}">
        <span class="photo-label">${i === 0 ? 'Principal' : `Foto ${i + 1}`}</span>
        <button class="photo-remove" type="button" data-photo-remove="${i}" title="Remover foto" aria-label="Remover foto">×</button>
        <div class="photo-order-controls" aria-label="Alterar ordem da foto">
          <button type="button" data-photo-prev="${i}" title="Mover foto para a esquerda" aria-label="Mover foto para a esquerda" ${i === 0 ? 'disabled' : ''}>←</button>
          <button type="button" data-photo-primary="${i}" title="Definir como foto principal" aria-label="Definir como foto principal" ${i === 0 ? 'disabled' : ''}>★</button>
          <button type="button" data-photo-next="${i}" title="Mover foto para a direita" aria-label="Mover foto para a direita" ${i === currentPhotos.length - 1 ? 'disabled' : ''}>→</button>
        </div>
      </div>`).join('');

    box.querySelectorAll('[data-photo-remove]').forEach(button => {
      button.onclick = () => {
        currentPhotos.splice(Number(button.dataset.photoRemove), 1);
        renderPhotoPreview();
      };
    });

    box.querySelectorAll('[data-photo-prev]').forEach(button => {
      button.onclick = () => movePhoto(Number(button.dataset.photoPrev), Number(button.dataset.photoPrev) - 1);
    });

    box.querySelectorAll('[data-photo-next]').forEach(button => {
      button.onclick = () => movePhoto(Number(button.dataset.photoNext), Number(button.dataset.photoNext) + 1);
    });

    box.querySelectorAll('[data-photo-primary]').forEach(button => {
      button.onclick = () => makePrimary(Number(button.dataset.photoPrimary));
    });

    box.querySelectorAll('.photo-order-card').forEach(card => {
      card.addEventListener('dragstart', event => {
        draggedIndex = Number(card.dataset.photoIndex);
        card.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(draggedIndex));
        }
      });

      card.addEventListener('dragover', event => {
        event.preventDefault();
        if (draggedIndex === null || draggedIndex === Number(card.dataset.photoIndex)) return;
        card.classList.add('is-drag-target');
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      });

      card.addEventListener('dragleave', () => card.classList.remove('is-drag-target'));

      card.addEventListener('drop', event => {
        event.preventDefault();
        card.classList.remove('is-drag-target');
        const target = Number(card.dataset.photoIndex);
        if (draggedIndex !== null) movePhoto(draggedIndex, target);
        draggedIndex = null;
      });

      card.addEventListener('dragend', () => {
        draggedIndex = null;
        box.querySelectorAll('.photo-order-card').forEach(item => item.classList.remove('is-dragging', 'is-drag-target'));
      });
    });
  };

  if (typeof fill === 'function') {
    const originalFill = fill;
    fill = function fillWithOrderedPhotos(product) {
      originalFill(product);
      // As URLs já existentes estão em currentPhotos e aparecem na grade.
      // Deixamos o campo de URL livre apenas para novas imagens, evitando duplicá-las ao salvar.
      const urlField = document.querySelector('#p-fotos');
      if (urlField) urlField.value = '';
    };
  }

  function updateHelpText() {
    const help = document.querySelector('.photo-help');
    if (help) help.textContent = 'Arraste as miniaturas para mudar a ordem. A primeira foto é a principal. Você também pode usar ←, ★ e →. Máximo de 8 fotos.';
    const urlLabel = document.querySelector('.photo-url-fallback label');
    if (urlLabel) urlLabel.textContent = 'Adicionar novas URLs de imagem (uma por linha)';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateHelpText, { once: true });
  } else {
    updateHelpText();
  }
})();
