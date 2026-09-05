const path = require('path');

// Somente scripts executados pelo navegador podem ser servidos diretamente.
// Os demais arquivos JavaScript da raiz pertencem ao backend e nunca devem
// ficar disponíveis como arquivos estáticos.
const PUBLIC_BROWSER_SCRIPTS = new Set([
  'accessibility-controls.js',
  'accessibility-panel.js',
  'accessibility-trigger-enhancement.js',
  'account-orders.js',
  'admin-coupons.js',
  'admin-customer-documents.js',
  'admin-dashboard.js',
  'admin-extra-tabs-navigation-fix.js',
  'admin-extra-tabs.js',
  'admin-favorites.js',
  'admin-hide-confirm.js',
  'admin-invoice-files.js',
  'admin-melhorenvio.js',
  'admin-order-cancellation.js',
  'admin-order-shipping.js',
  'admin-order-sync.js',
  'admin-payment-reasons.js',
  'admin-photo-order.js',
  'admin-product-details.js',
  'admin-product-enrichment.js',
  'admin-returns.js',
  'admin-secure-client.js',
  'admin-shipping.js',
  'admin-stock-catalog.js',
  'admin-store-health.js',
  'admin.js',
  'cart-availability.js',
  'cart-coupons.js',
  'cart-tools.js',
  'catalog-availability.js',
  'catalog-intelligence.js',
  'catalog-mobile-filters.js',
  'catalog-product-links.js',
  'catalog-technical-filters.js',
  'conta.js',
  'enderecos.js',
  'favorites-client.js',
  'home-digital-face-final.js',
  'home-enhancements.js',
  'home-gshock-live.js',
  'home-watch-selector.js',
  'image-proxy-client.js',
  'legal-footer.js',
  'mercadopago-checkout-client.js',
  'pickup-checkout-bridge.js',
  'product-compare.js',
  'product-confirmation-request.js',
  'product-page-core.js',
  'product-recommendations.js',
  'product-reviews-client.js',
  'produto-gallery-enhancements.js',
  'produto.js',
  'recuperar-senha-interface.js',
  'return-request-form.js',
  'script.js',
  'shipping-addresses.js',
  'shipping-cart.js',
  'site-dialog.js',
  'site-search.js'
]);

const PUBLIC_ASSET_EXTENSIONS = new Set([
  '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.ico'
]);

function normalizedRequestPath(value) {
  try {
    const raw = String(value || '/').split('?')[0];
    const decoded = decodeURIComponent(raw);
    if (decoded.includes('\0')) return null;
    return path.posix.normalize(`/${decoded.replace(/^\/+/, '')}`);
  } catch {
    return null;
  }
}

function isApplicationRoute(requestPath) {
  const normalized = normalizedRequestPath(requestPath);
  return normalized === '/api'
    || normalized?.startsWith('/api/')
    || normalized === '/healthz';
}

function isPublicStaticPath(requestPath) {
  const normalized = normalizedRequestPath(requestPath);
  if (!normalized) return false;
  if (normalized === '/') return true;

  if (normalized.startsWith('/assets/')) {
    return PUBLIC_ASSET_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase());
  }

  const relative = normalized.slice(1);
  if (!relative || relative.includes('/')) return false;
  if (relative === 'favicon.svg') return true;

  const extension = path.posix.extname(relative).toLowerCase();
  if (extension === '.html' || extension === '.css') return true;
  if (extension === '.js') return PUBLIC_BROWSER_SCRIPTS.has(relative);
  return false;
}

function createPublicStaticGuard() {
  return function publicStaticGuard(req, res, next) {
    if (isApplicationRoute(req.path) || isPublicStaticPath(req.path)) return next();
    return res.status(404).end();
  };
}

module.exports = {
  PUBLIC_BROWSER_SCRIPTS,
  normalizedRequestPath,
  isApplicationRoute,
  isPublicStaticPath,
  createPublicStaticGuard
};
