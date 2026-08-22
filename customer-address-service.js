const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { flushPersistentStore } = require('./persistent-store');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const USERS = path.join(DATA, 'users.json');

function readUsers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(USERS, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS, JSON.stringify(users, null, 2), 'utf8');
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeAddress(raw = {}, { id, label, principal = false } = {}) {
  const address = {
    id: String(id || raw.id || crypto.randomUUID()).slice(0, 80),
    label: String(label || raw.label || raw.apelido || 'Endereço').trim().slice(0, 40) || 'Endereço',
    principal: Boolean(principal ?? raw.principal),
    zip_code: digits(raw.zip_code).slice(0, 8),
    street_name: String(raw.street_name || '').trim().slice(0, 120),
    street_number: String(raw.street_number || '').trim().slice(0, 20),
    complement: String(raw.complement || '').trim().slice(0, 120),
    neighborhood: String(raw.neighborhood || '').trim().slice(0, 120),
    city_name: String(raw.city_name || '').trim().slice(0, 120),
    state_name: String(raw.state_name || raw.state_code || '').trim().slice(0, 120),
    state_code: String(raw.state_code || '').trim().slice(0, 2).toUpperCase(),
    country_name: 'Brasil'
  };
  return address;
}

function validateAddress(address) {
  if (
    digits(address?.zip_code).length !== 8 ||
    !String(address?.street_name || '').trim() ||
    !String(address?.street_number || '').trim() ||
    !String(address?.neighborhood || '').trim() ||
    !String(address?.city_name || '').trim() ||
    String(address?.state_code || '').trim().length !== 2
  ) {
    const error = new Error('Preencha CEP, rua, número, bairro, cidade e UF do endereço.');
    error.status = 400;
    throw error;
  }
}

function stripMeta(address) {
  if (!address) return null;
  const { id, label, principal, ...plain } = address;
  return plain;
}

function addressesForUser(user) {
  if (!user) return [];
  if (Array.isArray(user.enderecos) && user.enderecos.length) {
    const list = user.enderecos.map((item, index) => normalizeAddress(item, {
      id: item.id || `endereco-${index + 1}`,
      label: item.label || item.apelido || (index === 0 ? 'Principal' : `Endereço ${index + 1}`),
      principal: item.principal === true
    }));
    if (!list.some(item => item.principal) && list[0]) list[0].principal = true;
    return list;
  }
  if (user.endereco?.zip_code) {
    return [normalizeAddress(user.endereco, { id: 'principal', label: 'Principal', principal: true })];
  }
  return [];
}

function resolveUserAddress(user, requestedId) {
  const list = addressesForUser(user);
  if (!list.length) return null;
  const id = String(requestedId || '').trim();
  if (id) return list.find(address => address.id === id) || null;
  return list.find(address => address.principal) || list[0];
}

async function saveAddresses(userId, nextAddresses) {
  const users = readUsers();
  const index = users.findIndex(user => user.id === userId);
  if (index < 0) {
    const error = new Error('Conta não encontrada.');
    error.status = 404;
    throw error;
  }

  const cleaned = nextAddresses.map(item => normalizeAddress(item, {
    id: item.id,
    label: item.label,
    principal: item.principal
  }));
  if (cleaned.length && !cleaned.some(item => item.principal)) cleaned[0].principal = true;
  if (cleaned.filter(item => item.principal).length > 1) {
    let found = false;
    cleaned.forEach(item => {
      if (item.principal && !found) found = true;
      else item.principal = false;
    });
  }

  users[index].enderecos = cleaned;
  const principal = cleaned.find(item => item.principal) || cleaned[0] || null;
  users[index].endereco = stripMeta(principal);
  users[index].updated_at = new Date().toISOString();
  writeUsers(users);
  await flushPersistentStore();
  return { user: users[index], addresses: cleaned, principal };
}

module.exports = {
  addressesForUser,
  resolveUserAddress,
  normalizeAddress,
  validateAddress,
  stripMeta,
  saveAddresses
};

