const express = require('express');
const crypto = require('crypto');
const { userFromRequest } = require('./auth');
const {
  addressesForUser,
  normalizeAddress,
  validateAddress,
  saveAddresses,
  stripMeta
} = require('./customer-address-service');

function responsePayload(addresses) {
  const principal = addresses.find(item => item.principal) || addresses[0] || null;
  return {
    addresses,
    principal_address: principal ? stripMeta(principal) : null,
    principal_address_id: principal?.id || null
  };
}

function requireUser(req, res) {
  const user = userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Faça login para gerenciar seus endereços.' });
    return null;
  }
  return user;
}

function registerCustomerAddressRoutes(app) {
  app.use('/api/auth/addresses', express.json({ limit: '256kb' }));

  app.get('/api/auth/addresses', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    res.set('Cache-Control', 'no-store');
    res.json(responsePayload(addressesForUser(user)));
  });

  app.post('/api/auth/addresses', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const current = addressesForUser(user);
      if (current.length >= 10) return res.status(409).json({ error: 'Você pode cadastrar até 10 endereços.' });
      const address = normalizeAddress(req.body?.endereco || req.body || {}, {
        id: crypto.randomUUID(),
        label: req.body?.label || req.body?.apelido || 'Novo endereço',
        principal: current.length === 0 || req.body?.principal === true
      });
      validateAddress(address);
      if (address.principal) current.forEach(item => { item.principal = false; });
      current.push(address);
      const saved = await saveAddresses(user.id, current);
      res.status(201).json(responsePayload(saved.addresses));
    } catch (error) {
      res.status(Number(error.status) || 500).json({ error: error.message || 'Não foi possível salvar o endereço.' });
    }
  });

  app.put('/api/auth/addresses/:id', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const current = addressesForUser(user);
      const index = current.findIndex(item => item.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Endereço não encontrado.' });
      const principal = req.body?.principal === true || (req.body?.principal == null && current[index].principal);
      const next = normalizeAddress({ ...current[index], ...(req.body?.endereco || req.body || {}) }, {
        id: current[index].id,
        label: req.body?.label || req.body?.apelido || current[index].label,
        principal
      });
      validateAddress(next);
      if (principal) current.forEach(item => { item.principal = false; });
      current[index] = next;
      const saved = await saveAddresses(user.id, current);
      res.json(responsePayload(saved.addresses));
    } catch (error) {
      res.status(Number(error.status) || 500).json({ error: error.message || 'Não foi possível atualizar o endereço.' });
    }
  });

  app.post('/api/auth/addresses/:id/default', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const current = addressesForUser(user);
      const target = current.find(item => item.id === req.params.id);
      if (!target) return res.status(404).json({ error: 'Endereço não encontrado.' });
      current.forEach(item => { item.principal = item.id === target.id; });
      const saved = await saveAddresses(user.id, current);
      res.json(responsePayload(saved.addresses));
    } catch (error) {
      res.status(Number(error.status) || 500).json({ error: error.message || 'Não foi possível definir o endereço principal.' });
    }
  });

  app.delete('/api/auth/addresses/:id', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const current = addressesForUser(user);
      if (current.length <= 1) return res.status(409).json({ error: 'Cadastre outro endereço antes de excluir o único endereço da conta.' });
      const index = current.findIndex(item => item.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Endereço não encontrado.' });
      const wasPrincipal = current[index].principal;
      current.splice(index, 1);
      if (wasPrincipal && current[0]) current[0].principal = true;
      const saved = await saveAddresses(user.id, current);
      res.json(responsePayload(saved.addresses));
    } catch (error) {
      res.status(Number(error.status) || 500).json({ error: error.message || 'Não foi possível excluir o endereço.' });
    }
  });
}

module.exports = { registerCustomerAddressRoutes };

