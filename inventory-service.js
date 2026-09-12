const { shouldApplyPhysicalStock } = require('./product-availability-service');

function physicalRequirements(items) {
  const requirements = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!shouldApplyPhysicalStock(item)) continue;
    const productId = Number(item.id);
    const quantity = Math.max(0, Math.floor(Number(item.quantidade) || 0));
    if (!Number.isSafeInteger(productId) || productId <= 0 || quantity <= 0) continue;
    const current = requirements.get(productId) || {
      product_id: productId,
      sku: String(item.sku || ''),
      requested: 0
    };
    current.requested += quantity;
    requirements.set(productId, current);
  }
  return [...requirements.values()];
}

function applyPaidOrderStock(products, items) {
  const catalog = Array.isArray(products) ? products : [];
  const requirements = physicalRequirements(items);
  const conflicts = requirements.flatMap(requirement => {
    const product = catalog.find(item => Number(item.id) === requirement.product_id);
    const available = Math.max(0, Math.floor(Number(product?.estoque) || 0));
    return available < requirement.requested
      ? [{ ...requirement, available }]
      : [];
  });

  if (conflicts.length) return { applied: false, products: catalog, conflicts };

  const quantities = new Map(requirements.map(item => [item.product_id, item.requested]));
  const updated = catalog.map(product => {
    const quantity = quantities.get(Number(product.id));
    if (!quantity) return product;
    return { ...product, estoque: Math.max(0, Number(product.estoque || 0) - quantity) };
  });
  return { applied: true, products: updated, conflicts: [] };
}

function registerStockResult(order, result) {
  if (result.applied) {
    order.stock_applied = true;
    order.fulfillment_status = 'ready';
    delete order.stock_conflict;
    return;
  }
  order.stock_applied = false;
  order.fulfillment_status = 'stock_review_required';
  order.stock_conflict = {
    detected_at: new Date().toISOString(),
    items: result.conflicts
  };
}

module.exports = { applyPaidOrderStock, physicalRequirements, registerStockResult };
