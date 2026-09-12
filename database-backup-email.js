const crypto = require('crypto');
const zlib = require('zlib');
const { Pool } = require('pg');
const { sendResendEmail } = require('./resend-client');

function databaseSsl(connectionString) {
  const configured = String(process.env.DATABASE_SSL || '').trim().toLowerCase();
  if (configured) {
    if (configured === 'false' || configured === '0' || configured === 'off') return false;
    return { rejectUnauthorized: false };
  }

  try {
    const url = new URL(connectionString);
    const sslMode = String(url.searchParams.get('sslmode') || '').toLowerCase();
    if (sslMode === 'require' || sslMode === 'verify-ca' || sslMode === 'verify-full') {
      return { rejectUnauthorized: false };
    }
  } catch {}

  return false;
}

async function buildSnapshot(pool) {
  const [versionResult, stateResult, couponsResult, usesResult, schemaResult, constraintsResult, indexesResult, sequencesResult] = await Promise.all([
    pool.query('SELECT version() AS version'),
    pool.query('SELECT key, value, updated_at FROM relogio_state ORDER BY key'),
    pool.query('SELECT * FROM relogio_coupons ORDER BY id'),
    pool.query('SELECT * FROM relogio_coupon_uses ORDER BY id'),
    pool.query(`SELECT table_name, ordinal_position, column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
                FROM information_schema.columns
                WHERE table_schema = 'public'
                ORDER BY table_name, ordinal_position`),
    pool.query(`SELECT conrelid::regclass::text AS table_name, conname, contype, pg_get_constraintdef(oid, true) AS definition
                FROM pg_constraint
                WHERE connamespace = 'public'::regnamespace
                ORDER BY table_name, conname`),
    pool.query(`SELECT tablename AS table_name, indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = 'public'
                ORDER BY tablename, indexname`),
    pool.query(`SELECT sequencename, last_value, start_value, increment_by
                FROM pg_sequences
                WHERE schemaname = 'public'
                ORDER BY sequencename`)
  ]);

  return {
    format: 'relogio-e-cia-postgresql-backup-v1',
    generated_at: new Date().toISOString(),
    database: 'relogio_e_cia_db',
    postgres_version: versionResult.rows[0]?.version || null,
    tables: {
      relogio_state: stateResult.rows,
      relogio_coupons: couponsResult.rows,
      relogio_coupon_uses: usesResult.rows
    },
    schema: {
      columns: schemaResult.rows,
      constraints: constraintsResult.rows,
      indexes: indexesResult.rows,
      sequences: sequencesResult.rows
    }
  };
}

async function runDatabaseBackupEmail() {
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  const recipient = String(process.env.ADMIN_EMAIL || '').trim();

  if (!connectionString) {
    console.warn('BACKUP_EMAIL_STATUS: ignorado; DATABASE_URL ausente.');
    return;
  }
  if (!recipient) {
    console.warn('BACKUP_EMAIL_STATUS: ignorado; ADMIN_EMAIL ausente.');
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: databaseSsl(connectionString),
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000
  });

  try {
    const snapshot = await buildSnapshot(pool);
    const json = Buffer.from(JSON.stringify(snapshot), 'utf8');
    const gzip = zlib.gzipSync(json, { level: 9 });
    const sha256 = crypto.createHash('sha256').update(gzip).digest('hex');
    const date = snapshot.generated_at.slice(0, 10);
    const filename = `relogio-e-cia-postgresql-backup-${date}.json.gz`;
    const readme = [
      'BACKUP DE SEGURANCA - RELOGIO E CIA',
      '',
      `Gerado em: ${snapshot.generated_at}`,
      `Arquivo: ${filename}`,
      `SHA-256: ${sha256}`,
      `Tamanho compactado: ${gzip.length} bytes`,
      '',
      'Conteudo: todas as linhas atuais das tabelas relogio_state, relogio_coupons e relogio_coupon_uses,',
      'incluindo catalogo de produtos e imagens embutidas, alem da descricao do schema, constraints, indices e sequencias.',
      '',
      'ATENCAO: este arquivo contem dados privados da loja e pode conter dados pessoais e credenciais/tokens operacionais.',
      'Nao envie para terceiros, nao publique e nao coloque no GitHub.',
      '',
      'Para restauracao, mantenha o arquivo .json.gz intacto. A estrutura foi feita para permitir importar os dados em um novo PostgreSQL.'
    ].join('\n');

    const result = await sendResendEmail({
      to: recipient,
      subject: `Backup de segurança do PostgreSQL — Relógio e Cia — ${date}`,
      html: `<p>Backup de segurança do banco PostgreSQL da Relógio e Cia.</p><p><strong>SHA-256:</strong> ${sha256}</p><p>Guarde os anexos em local privado. Eles contêm dados confidenciais da operação.</p>`,
      idempotencyKey: `relogio-e-cia-postgres-backup-${date}-v1`,
      attachments: [
        { filename, content: gzip.toString('base64') },
        { filename: `LEIA-ME-backup-${date}.txt`, content: Buffer.from(readme, 'utf8').toString('base64') }
      ]
    });

    if (!result.sent) {
      console.error('BACKUP_EMAIL_STATUS: falha no envio.', {
        reason: result.reason,
        status: result.status || null,
        message: result.message || null,
        bytes: gzip.length,
        sha256
      });
      return;
    }

    console.log('BACKUP_EMAIL_SENT', {
      id: result.id || null,
      bytes: gzip.length,
      sha256,
      state_rows: snapshot.tables.relogio_state.length,
      coupons_rows: snapshot.tables.relogio_coupons.length,
      coupon_uses_rows: snapshot.tables.relogio_coupon_uses.length
    });
  } catch (error) {
    console.error('BACKUP_EMAIL_STATUS: erro ao gerar backup.', { message: error?.message || String(error) });
  } finally {
    await pool.end().catch(() => {});
  }
}

runDatabaseBackupEmail().catch(error => {
  console.error('BACKUP_EMAIL_STATUS: erro não tratado.', { message: error?.message || String(error) });
});
