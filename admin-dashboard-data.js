const fs = require('fs');
const path = require('path');
const { listAudit } = require('./admin-audit');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PRODUCTS = path.join(DATA, 'products.json');
const ORDERS = path.join(DATA, 'orders.json');
const RETURNS = path.join(DATA, 'return-requests.json');
const REVIEWS = path.join(DATA, 'product-reviews.json');

function read(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function paidOrder(order) {
  const orderStatus = String(order?.status || '').toLowerCase();
  const paymentStatus = String(order?.payment_status || '').toLowerCase();
  return orderStatus === 'paid' || ['approved', 'processed'].includes(paymentStatus);
}

function cancelledOrder(order) {
  const orderStatus = String(order?.status || '').toLowerCase();
  const cancellationStatus = String(order?.store_cancellation?.status || '').toLowerCase();
  return ['cancelled', 'canceled', 'refunded'].includes(orderStatus) || cancellationStatus === 'refunded';
}

function orderItems(order) {
  const candidates = [order?.items, order?.products, order?.produtos, order?.cart?.items, order?.checkout?.items];
  return candidates.find(Array.isArray) || [];
}

function itemQuantity(item) {
  return Math.max(0, Number(item?.quantidade ?? item?.quantity ?? item?.qtd) || 0);
}

function itemProductId(item) {
  const number = Number(item?.id ?? item?.product_id ?? item?.produto_id ?? item?.product?.id);
  return Number.isFinite(number) ? number : null;
}

function itemRevenue(item) {
  const quantity = itemQuantity(item);
  const unit = Number(item?.unit_price ?? item?.preco ?? item?.price) || 0;
  return quantity * unit;
}

function safeOrder(order) {
  return {
    id: String(order?.id || ''),
    customer_name: String(order?.payer?.nome || 'Cliente').slice(0, 120),
    customer_email: String(order?.payer?.email || '').slice(0, 180),
    total: Number(order?.total || 0),
    status: String(order?.status || ''),
    payment_status: String(order?.payment_status || ''),
    invoice_status: String(order?.invoice?.status || 'pending'),
    fulfillment_status: String(order?.fulfillment?.status || ''),
    created_at: order?.created_at || null
  };
}

function buildDashboardSummary() {
  const products = read(PRODUCTS, []);
  const orders = read(ORDERS, []);
  const returns = read(RETURNS, []);
  const reviews = read(REVIEWS, []);
  const productMap = new Map(products.map(product => [Number(product.id), product]));

  const approvedOrders = orders.filter(order => paidOrder(order) && !cancelledOrder(order));
  const grossRevenue = approvedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const paidOrders = approvedOrders.length;
  const averageTicket = paidOrders ? grossRevenue / paidOrders : 0;
  const itemsSold = approvedOrders.reduce((sum, order) => sum + orderItems(order).reduce((subtotal, item) => subtotal + itemQuantity(item), 0), 0);

  const productSales = new Map();
  const brandSales = new Map();
  for (const order of approvedOrders) {
    for (const item of orderItems(order)) {
      const productId = itemProductId(item);
      const product = productMap.get(productId);
      const quantity = itemQuantity(item);
      const revenue = itemRevenue(item);
      const productName = String(item?.nome || item?.title || product?.nome || `Produto ${productId || ''}`).trim();
      const brand = String(product?.marca || item?.marca || 'Sem marca').trim() || 'Sem marca';
      const currentProduct = productSales.get(productId || productName) || { product_id: productId, name: productName, brand, quantity: 0, revenue: 0 };
      currentProduct.quantity += quantity;
      currentProduct.revenue += revenue;
      productSales.set(productId || productName, currentProduct);
      const currentBrand = brandSales.get(brand) || { brand, quantity: 0, revenue: 0 };
      currentBrand.quantity += quantity;
      currentBrand.revenue += revenue;
      brandSales.set(brand, currentBrand);
    }
  }

  const activeProducts = products.filter(product => product?.ativo !== false);
  const lowStockProducts = activeProducts.filter(product => Number(product?.estoque || 0) > 0 && Number(product?.estoque || 0) <= 2);
  const outOfStockProducts = activeProducts.filter(product => Number(product?.estoque || 0) <= 0);
  const totalStockUnits = activeProducts.reduce((sum, product) => sum + Math.max(0, Number(product?.estoque || 0)), 0);
  const cancelledOrders = orders.filter(cancelledOrder).length;
  const pendingPaymentOrders = orders.filter(order => !paidOrder(order) && ['creating', 'pending'].includes(String(order?.payment_status || order?.status || '').toLowerCase())).length;
  const pendingInvoices = approvedOrders.filter(order => String(order?.invoice?.status || 'pending').toLowerCase() !== 'emitted').length;
  const pendingShipping = approvedOrders.filter(order => !['shipped', 'ready_for_pickup'].includes(String(order?.fulfillment?.status || '').toLowerCase())).length;
  const openReturns = returns.filter(item => !['concluida', 'recusada'].includes(String(item?.status || '').toLowerCase())).length;
  const pendingReviews = reviews.filter(review => review?.status === 'pending').length;
  const approvedReviews = reviews.filter(review => review?.status === 'approved').length;

  const alerts = [
    { key: 'invoice', label: 'Pedidos pagos aguardando NF-e', count: pendingInvoices, target: 'pedidos', severity: pendingInvoices ? 'warning' : 'ok' },
    { key: 'shipping', label: 'Pedidos pagos aguardando envio/retirada', count: pendingShipping, target: 'pedidos', severity: pendingShipping ? 'warning' : 'ok' },
    { key: 'returns', label: 'Solicitações de pós-venda abertas', count: openReturns, target: 'trocas', severity: openReturns ? 'warning' : 'ok' },
    { key: 'reviews', label: 'Avaliações aguardando moderação', count: pendingReviews, target: 'reviews', severity: pendingReviews ? 'warning' : 'ok' },
    { key: 'stock', label: 'Produtos visíveis sem estoque', count: outOfStockProducts.length, target: 'produtos', severity: outOfStockProducts.length ? 'warning' : 'ok' }
  ];

  return {
    generated_at: new Date().toISOString(),
    kpis: {
      gross_revenue: Number(grossRevenue.toFixed(2)),
      paid_orders: paidOrders,
      average_ticket: Number(averageTicket.toFixed(2)),
      items_sold: itemsSold,
      total_orders: orders.length,
      pending_payment_orders: pendingPaymentOrders,
      cancelled_orders: cancelledOrders,
      active_products: activeProducts.length,
      total_stock_units: totalStockUnits,
      low_stock_products: lowStockProducts.length,
      out_of_stock_products: outOfStockProducts.length,
      pending_invoices: pendingInvoices,
      pending_shipping: pendingShipping,
      open_returns: openReturns,
      pending_reviews: pendingReviews,
      approved_reviews: approvedReviews
    },
    alerts,
    top_products: Array.from(productSales.values())
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 8)
      .map(item => ({ ...item, revenue: Number(item.revenue.toFixed(2)) })),
    sales_by_brand: Array.from(brandSales.values())
      .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
      .map(item => ({ ...item, revenue: Number(item.revenue.toFixed(2)) })),
    low_stock: lowStockProducts
      .sort((a, b) => Number(a.estoque || 0) - Number(b.estoque || 0))
      .slice(0, 10)
      .map(product => ({ id: product.id, nome: product.nome, sku: product.sku, marca: product.marca, estoque: Number(product.estoque || 0) })),
    recent_orders: orders
      .slice()
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 8)
      .map(safeOrder)
  };
}

function registerAdminDashboardRoutes(app) {
  app.get('/api/admin/dashboard-summary', (req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json(buildDashboardSummary());
  });

  app.get('/api/admin/audit', (req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json({ entries: listAudit(req.query.limit || 150) });
  });
}

module.exports = { buildDashboardSummary, registerAdminDashboardRoutes };