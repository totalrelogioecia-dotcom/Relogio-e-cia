const { URL } = require('url');

const ALLOWED_HOSTS = new Set(['www.casio.com']);
const ALLOWED_PREFIX = '/content/dam/casio/';

function registerImageProxy(app) {
  app.get('/api/image-proxy', async (req, res) => {
    try {
      const raw = String(req.query?.url || '').trim();
      if (!raw) return res.status(400).send('URL ausente.');

      let target;
      try { target = new URL(raw); }
      catch { return res.status(400).send('URL inválida.'); }

      if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname) || !target.pathname.startsWith(ALLOWED_PREFIX)) {
        return res.status(403).send('Imagem não permitida.');
      }

      const upstream = await fetch(target.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RelogioECia/1.0; +https://relogio-e-cia.onrender.com)',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Referer': 'https://www.casio.com/'
        },
        redirect: 'follow'
      });

      if (!upstream.ok) {
        return res.status(upstream.status === 404 ? 404 : 502).send('Não foi possível carregar a imagem.');
      }

      const type = String(upstream.headers.get('content-type') || '');
      if (!type.startsWith('image/')) return res.status(502).send('Resposta não é uma imagem.');

      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.set('Content-Type', type);
      res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.set('X-Content-Type-Options', 'nosniff');
      res.send(bytes);
    } catch (error) {
      console.error('Erro no proxy de imagem:', error.message);
      res.status(502).send('Não foi possível carregar a imagem.');
    }
  });
}

module.exports = { registerImageProxy };
