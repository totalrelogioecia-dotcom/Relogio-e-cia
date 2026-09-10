(() => {
  'use strict';

  const SELECTOR = '#marcas .home-watch-photo img, #product-grid .card-photo img';
  const watched = new WeakSet();

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function backgroundSample(pixels, size) {
    const points = [
      [1, 1], [size - 2, 1], [1, size - 2], [size - 2, size - 2]
    ];
    const total = points.reduce((sum, [x, y]) => {
      const offset = (y * size + x) * 4;
      sum[0] += pixels[offset];
      sum[1] += pixels[offset + 1];
      sum[2] += pixels[offset + 2];
      sum[3] += pixels[offset + 3];
      return sum;
    }, [0, 0, 0, 0]);
    return total.map(value => value / points.length);
  }

  function contentBounds(pixels, size, background) {
    const xCounts = new Uint16Array(size);
    const yCounts = new Uint16Array(size);
    let count = 0;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4;
        const alpha = pixels[offset + 3];
        let content = false;

        if (background[3] < 32) {
          content = alpha > 36;
        } else if (alpha > 24) {
          const difference = Math.max(
            Math.abs(pixels[offset] - background[0]),
            Math.abs(pixels[offset + 1] - background[1]),
            Math.abs(pixels[offset + 2] - background[2]),
            Math.abs(alpha - background[3])
          );
          content = difference > 28;
        }

        if (content) {
          xCounts[x] += 1;
          yCounts[y] += 1;
          count += 1;
        }
      }
    }

    if (count < 40) return null;
    const trim = Math.max(1, Math.floor(count * 0.006));

    function quantileBoundary(counts, reverse = false) {
      let accumulated = 0;
      if (reverse) {
        for (let index = counts.length - 1; index >= 0; index -= 1) {
          accumulated += counts[index];
          if (accumulated >= trim) return index;
        }
        return counts.length - 1;
      }
      for (let index = 0; index < counts.length; index += 1) {
        accumulated += counts[index];
        if (accumulated >= trim) return index;
      }
      return 0;
    }

    return {
      left: quantileBoundary(xCounts),
      right: quantileBoundary(xCounts, true),
      top: quantileBoundary(yCounts),
      bottom: quantileBoundary(yCounts, true)
    };
  }

  function normalizePhoto(image) {
    if (!image.naturalWidth || !image.naturalHeight) return;

    try {
      const size = 96;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;

      context.clearRect(0, 0, size, size);
      context.drawImage(image, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      const bounds = contentBounds(pixels, size, backgroundSample(pixels, size));
      if (!bounds) return;

      const occupied = Math.max(
        (bounds.right - bounds.left + 1) / size,
        (bounds.bottom - bounds.top + 1) / size
      );
      if (!Number.isFinite(occupied) || occupied < 0.12) return;

      const isHome = Boolean(image.closest('#marcas'));
      const target = isHome ? 0.78 : 0.76;
      const maximum = isHome ? 1.42 : 1.32;
      let scale = clamp(target / occupied, 0.88, maximum);
      if (Math.abs(scale - 1) < 0.035) scale = 1;

      image.style.setProperty('--photo-normalize-scale', scale.toFixed(3));
      image.dataset.photoNormalized = 'true';
    } catch {
      // Fotos externas sem CORS continuam com o enquadramento CSS seguro.
    }
  }

  function watch(image) {
    if (!(image instanceof HTMLImageElement) || watched.has(image)) return;
    watched.add(image);
    if (image.complete) normalizePhoto(image);
    else image.addEventListener('load', () => normalizePhoto(image), { once: true });
  }

  function scan(root) {
    if (root instanceof HTMLImageElement && root.matches(SELECTOR)) watch(root);
    root.querySelectorAll?.(SELECTOR).forEach(watch);
  }

  scan(document);
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof Element) scan(node);
    }));
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
