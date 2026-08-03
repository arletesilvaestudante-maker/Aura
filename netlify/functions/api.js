import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: { rejectUnauthorized: true }
    })
  : null;

const COOKIE = "aura_session";
const SESSION_HOURS = 12;

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers
    },
    body: JSON.stringify(body)
  };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    throw Object.assign(new Error("JSON inválido."), { statusCode: 400 });
  }
}

function routePath(event) {
  return event.path
    .replace(/^\/\.netlify\/functions\/api/, "")
    .replace(/^\/api/, "") || "/";
}

function cookies(event) {
  return Object.fromEntries(
    String(event.headers.cookie || "")
      .split(";")
      .map((item) => item.trim().split("="))
      .filter(([key, value]) => key && value)
  );
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    login: row.login,
    role: row.role,
    active: row.active,
    mustChangePassword: row.must_change_password
  };
}

async function authenticate(event) {
  const token = cookies(event)[COOKIE];
  if (!token) return null;
  const result = await pool.query(
    `SELECT u.*
       FROM aura_sessions s
       JOIN aura_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE`,
    [tokenHash(token)]
  );
  return result.rows[0] || null;
}

function requireRole(user, allowed) {
  if (!user) throw Object.assign(new Error("Sessão inválida ou expirada."), { statusCode: 401 });
  if (!allowed.includes(user.role)) {
    throw Object.assign(new Error("Acesso não autorizado."), { statusCode: 403 });
  }
}

function cleanText(value, max, required = false) {
  const text = String(value ?? "").trim();
  if (required && !text) throw Object.assign(new Error("Campo obrigatório não informado."), { statusCode: 400 });
  if (text.length > max) throw Object.assign(new Error(`Campo excede ${max} caracteres.`), { statusCode: 400 });
  return text;
}

function validatePassword(password) {
  return typeof password === "string"
    && password.length >= 10
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

async function audit(user, action, entityType, entityId, metadata = {}) {
  await pool.query(
    `INSERT INTO aura_audit_log (user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [user?.id || null, action, entityType || null, entityId || null, metadata]
  );
}

async function ensureBootstrapAdmin() {
  const login = process.env.AURA_BOOTSTRAP_LOGIN;
  const password = process.env.AURA_BOOTSTRAP_PASSWORD;
  const name = process.env.AURA_BOOTSTRAP_NAME || "Administrador Aura";
  if (!login || !password) return;
  if (!validatePassword(password)) throw new Error("AURA_BOOTSTRAP_PASSWORD não atende à política de senha.");
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO aura_users (name, login, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, 'admin', TRUE)
     ON CONFLICT (login) DO NOTHING`,
    [name, login.toLowerCase(), hash]
  );
}

async function handlerInternal(event) {
  if (!pool) return response(503, { error: "Banco de dados não configurado." });
  await ensureBootstrapAdmin();
  const method = event.httpMethod;
  const path = routePath(event);

  if (method === "GET" && path === "/health") {
    await pool.query("SELECT 1");
    return response(200, { status: "ready" });
  }

  if (method === "POST" && path === "/auth/login") {
    const body = parseBody(event);
    const login = cleanText(body.login, 80, true).toLowerCase();
    const result = await pool.query("SELECT * FROM aura_users WHERE login = $1 AND active = TRUE", [login]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(String(body.password || ""), user.password_hash))) {
      return response(401, { error: "Login ou senha inválidos." });
    }
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO aura_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' hours')::interval)`,
      [user.id, tokenHash(token), String(SESSION_HOURS)]
    );
    await audit(user, "auth.login", "user", user.id);
    return response(200, { user: publicUser(user) }, {
      "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`
    });
  }

  const user = await authenticate(event);

  if (method === "GET" && path === "/auth/me") {
    requireRole(user, ["operador", "admin", "master"]);
    return response(200, { user: publicUser(user) });
  }

  if (method === "POST" && path === "/auth/logout") {
    if (user) {
      const token = cookies(event)[COOKIE];
      await pool.query("DELETE FROM aura_sessions WHERE token_hash = $1", [tokenHash(token)]);
    }
    return response(200, { success: true }, {
      "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
    });
  }

  if (method === "POST" && path === "/auth/change-password") {
    requireRole(user, ["operador", "admin", "master"]);
    const body = parseBody(event);
    if (!validatePassword(body.newPassword)) {
      return response(400, { error: "A nova senha deve ter 10 caracteres, maiúscula, minúscula, número e símbolo." });
    }
    if (!(await bcrypt.compare(String(body.currentPassword || ""), user.password_hash))) {
      return response(400, { error: "Senha atual inválida." });
    }
    const hash = await bcrypt.hash(body.newPassword, 12);
    await pool.query(
      "UPDATE aura_users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2",
      [hash, user.id]
    );
    const currentToken = cookies(event)[COOKIE];
    await pool.query(
      "DELETE FROM aura_sessions WHERE user_id = $1 AND token_hash <> $2",
      [user.id, tokenHash(currentToken)]
    );
    await audit(user, "auth.password_changed", "user", user.id);
    return response(200, { success: true });
  }

  requireRole(user, ["operador", "admin", "master"]);
  if (user.must_change_password) {
    return response(403, { error: "Troque a senha temporária antes de continuar.", mustChangePassword: true });
  }

  if (method === "GET" && path === "/pid/bootstrap") {
    const reasons = await pool.query(
      `SELECT id, product, reason_group AS "group", motivo, name, justification,
              pid_level AS level, nuvidio, article
         FROM aura_catalog_reasons WHERE active = TRUE ORDER BY product, motivo, name`
    );
    return response(200, { reasons: reasons.rows, questions: [] });
  }

  if (method === "GET" && path === "/pid/attendances") {
    const limit = Math.min(Number(event.queryStringParameters?.limit) || 200, 500);
    const result = await pool.query(
      `SELECT a.id, a.protocol, a.product, a.reason_id AS "reasonId", a.payload,
              a.created_at AS "createdAt", u.name AS operator,
              u.login AS "operatorLogin"
         FROM aura_attendances a
         JOIN aura_users u ON u.id = a.operator_id
        ORDER BY a.created_at DESC LIMIT $1`,
      [limit]
    );
    const records = result.rows.map((row) => ({ ...row.payload, ...row }));
    return response(200, { records, attendances: records });
  }

  if (method === "GET" && path === "/pid/recontacts") {
    const cpf = String(event.queryStringParameters?.cpf || "").replace(/\D/g, "").slice(0, 11);
    if (cpf.length !== 11) return response(400, { error: "Informe um CPF válido." });
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS "last24Hours",
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '72 hours')::int AS "last72Hours",
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS "last7Days",
         MAX(created_at) AS "lastContactAt"
       FROM aura_attendances
       WHERE customer_cpf = $1`,
      [cpf]
    );
    return response(200, { cpf, ...result.rows[0] });
  }

  if (method === "POST" && path === "/pid/attendances") {
    const body = parseBody(event);
    const protocol = cleanText(body.protocol || body.pidProtocol || `AURA-${Date.now()}`, 80, true);
    const product = cleanText(body.product, 30, true).toUpperCase();
    const cpf = String(body.cpf || body.customerCpf || "").replace(/\D/g, "").slice(0, 11) || null;
    const phone = String(body.phone || body.customerPhone || "").replace(/\D/g, "").slice(0, 11) || null;
    const result = await pool.query(
      `INSERT INTO aura_attendances
       (protocol, operator_id, product, reason_id, customer_name, customer_cpf, customer_phone, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, protocol, created_at AS "createdAt"`,
      [protocol, user.id, product, body.reasonId || null, cleanText(body.customerName || body.name, 180), cpf, phone, body]
    );
    await audit(user, "attendance.created", "attendance", result.rows[0].id, { protocol, product });
    return response(201, { success: true, attendance: result.rows[0] });
  }

  if (path === "/admin/users" && method === "GET") {
    requireRole(user, ["admin", "master"]);
    const result = await pool.query("SELECT * FROM aura_users ORDER BY name");
    return response(200, { users: result.rows.map(publicUser) });
  }

  if (path === "/admin/users" && method === "POST") {
    requireRole(user, ["admin", "master"]);
    const body = parseBody(event);
    if (!validatePassword(body.password)) return response(400, { error: "Senha provisória fora da política." });
    const role = ["operador", "admin", "master"].includes(body.role) ? body.role : "operador";
    const result = await pool.query(
      `INSERT INTO aura_users (name, login, password_hash, role)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [cleanText(body.name, 160, true), cleanText(body.login, 80, true).toLowerCase(), await bcrypt.hash(body.password, 12), role]
    );
    await audit(user, "user.created", "user", result.rows[0].id, { role });
    return response(201, { user: publicUser(result.rows[0]) });
  }

  const userToggle = path.match(/^\/admin\/users\/([^/]+)$/);
  if (userToggle && method === "PUT") {
    requireRole(user, ["admin", "master"]);
    const body = parseBody(event);
    const result = await pool.query(
      "UPDATE aura_users SET active = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [Boolean(body.active), userToggle[1]]
    );
    return result.rows[0] ? response(200, { user: publicUser(result.rows[0]) }) : response(404, { error: "Usuário não encontrado." });
  }

  const reset = path.match(/^\/admin\/users\/([^/]+)\/reset-password$/);
  if (reset && method === "POST") {
    requireRole(user, ["admin", "master"]);
    const body = parseBody(event);
    if (!validatePassword(body.password)) return response(400, { error: "Senha provisória fora da política." });
    await pool.query(
      `UPDATE aura_users SET password_hash=$1, must_change_password=TRUE, updated_at=NOW() WHERE id=$2`,
      [await bcrypt.hash(body.password, 12), reset[1]]
    );
    await pool.query("DELETE FROM aura_sessions WHERE user_id=$1", [reset[1]]);
    await audit(user, "user.password_reset", "user", reset[1]);
    return response(200, { success: true });
  }

  if (path === "/admin/catalog/import" && method === "POST") {
    requireRole(user, ["admin", "master"]);
    const body = parseBody(event);
    if (!Array.isArray(body.reasons) || body.reasons.length > 5000) return response(400, { error: "Catálogo inválido." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (body.replace) await client.query("UPDATE aura_catalog_reasons SET active = FALSE");
      for (const item of body.reasons) {
        await client.query(
          `INSERT INTO aura_catalog_reasons
           (id, product, reason_group, motivo, name, justification, pid_level, nuvidio, article, active, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,NOW())
           ON CONFLICT (id) DO UPDATE SET product=EXCLUDED.product, reason_group=EXCLUDED.reason_group,
           motivo=EXCLUDED.motivo, name=EXCLUDED.name, justification=EXCLUDED.justification,
           pid_level=EXCLUDED.pid_level, nuvidio=EXCLUDED.nuvidio, article=EXCLUDED.article,
           active=TRUE, updated_at=NOW()`,
          [cleanText(item.id || crypto.randomUUID(), 180, true), cleanText(item.product, 30, true),
           cleanText(item.group || item.motivo, 160, true), cleanText(item.motivo, 220, true),
           cleanText(item.name, 220, true), cleanText(item.justification, 5000),
           ["LIGHT", "SOFT", "HARD"].includes(item.level) ? item.level : "LIGHT",
           Boolean(item.nuvidio), cleanText(item.article, 50000)]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await audit(user, "catalog.imported", "catalog", null, { count: body.reasons.length });
    return response(200, { success: true });
  }

  if (path === "/operational-alerts" && method === "GET") {
    const activeOnly = event.queryStringParameters?.activeOnly !== "false";
    const result = await pool.query(
      `SELECT a.id, a.title, a.message, a.severity, a.image_url AS "imageUrl", a.active,
              a.created_at AS "createdAt", ack.acknowledged_at AS "acknowledgedAt"
         FROM aura_operational_alerts a
         LEFT JOIN aura_alert_acknowledgements ack ON ack.alert_id=a.id AND ack.user_id=$1
        WHERE ($2::boolean=FALSE OR a.active=TRUE) ORDER BY a.created_at DESC`,
      [user.id, activeOnly]
    );
    return response(200, { alerts: result.rows });
  }

  if (path === "/settings/process-images" && method === "GET") {
    const result = await pool.query(
      `SELECT setting_key AS key, setting_value AS value
         FROM aura_app_settings
        WHERE setting_key IN ('pine_image', 'ouvidoria_image')`
    );
    return response(200, {
      images: Object.fromEntries(result.rows.map((row) => [row.key, row.value]))
    });
  }

  if (path === "/admin/settings/process-images" && method === "PUT") {
    requireRole(user, ["admin", "master"]);
    const body = parseBody(event);
    const key = body.type === "pine" ? "pine_image"
      : body.type === "ouvidoria" ? "ouvidoria_image" : null;
    if (!key) return response(400, { error: "Tipo de imagem inválido." });
    const value = String(body.imageData || "");
    if (value && !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)) {
      return response(400, { error: "Formato de imagem inválido." });
    }
    if (value.length > 1_500_000) {
      return response(400, { error: "Imagem acima do limite permitido." });
    }
    if (value) {
      await pool.query(
        `INSERT INTO aura_app_settings (setting_key, setting_value, updated_by)
         VALUES ($1,$2,$3)
         ON CONFLICT (setting_key) DO UPDATE
           SET setting_value=EXCLUDED.setting_value, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
        [key, value, user.id]
      );
    } else {
      await pool.query("DELETE FROM aura_app_settings WHERE setting_key=$1", [key]);
    }
    await audit(user, "settings.process_image_updated", "setting", key);
    return response(200, { success: true });
  }

  if (path === "/operational-alerts" && method === "POST") {
    requireRole(user, ["admin", "master"]);
    const body = parseBody(event);
    const severity = ["informativo", "atencao", "critico"].includes(body.severity) ? body.severity : "informativo";
    let imageUrl = body.imageUrl ? cleanText(body.imageUrl, 1_500_000) : null;
    if (!imageUrl && body.imageBase64) {
      const contentType = cleanText(body.imageContentType, 80, true).toLowerCase();
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(contentType)) {
        return response(400, { error: "Formato de imagem não permitido." });
      }
      const base64 = String(body.imageBase64).replace(/^data:[^;]+;base64,/, "");
      if (!/^[A-Za-z0-9+/=]+$/.test(base64) || base64.length > 1_400_000) {
        return response(400, { error: "Imagem inválida ou acima do limite permitido." });
      }
      imageUrl = `data:${contentType};base64,${base64}`;
    }
    const result = await pool.query(
      `INSERT INTO aura_operational_alerts (title,message,severity,image_url,created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [cleanText(body.title, 180, true), cleanText(body.message, 10000, true), severity,
       imageUrl, user.id]
    );
    await audit(user, "alert.created", "alert", result.rows[0].id);
    return response(201, { success: true, id: result.rows[0].id });
  }

  if (path === "/operational-alerts/report" && method === "GET") {
    requireRole(user, ["admin", "master"]);
    const alerts = await pool.query(
      `SELECT a.id,a.title,a.severity,a.active,a.created_at AS "createdAt",COUNT(ack.user_id)::int AS "acknowledgmentCount"
       FROM aura_operational_alerts a LEFT JOIN aura_alert_acknowledgements ack ON ack.alert_id=a.id
       GROUP BY a.id ORDER BY a.created_at DESC`
    );
    const acknowledgements = await pool.query(
      `SELECT a.title AS "alertTitle",u.name AS "operatorName",u.login AS "operatorLogin",
              ack.acknowledged_at AS "acknowledgedAt"
       FROM aura_alert_acknowledgements ack JOIN aura_operational_alerts a ON a.id=ack.alert_id
       JOIN aura_users u ON u.id=ack.user_id ORDER BY ack.acknowledged_at DESC LIMIT 1000`
    );
    return response(200, { alerts: alerts.rows, acknowledgements: acknowledgements.rows });
  }

  const ack = path.match(/^\/operational-alerts\/([^/]+)\/ack$/);
  if (ack && method === "POST") {
    await pool.query(
      `INSERT INTO aura_alert_acknowledgements (alert_id,user_id) VALUES ($1,$2)
       ON CONFLICT (alert_id,user_id) DO NOTHING`,
      [ack[1], user.id]
    );
    return response(200, { success: true });
  }

  const alertToggle = path.match(/^\/operational-alerts\/([^/]+)$/);
  if (alertToggle && method === "PUT") {
    requireRole(user, ["admin", "master"]);
    const body = parseBody(event);
    await pool.query("UPDATE aura_operational_alerts SET active=$1,updated_at=NOW() WHERE id=$2", [Boolean(body.active), alertToggle[1]]);
    return response(200, { success: true });
  }

  return response(404, { error: "Rota não encontrada." });
}

export async function handler(event) {
  try {
    return await handlerInternal(event);
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    if (statusCode >= 500) console.error("Aura API error", { message: error.message });
    return response(statusCode, { error: statusCode >= 500 ? "Erro interno da aplicação." : error.message });
  }
}
