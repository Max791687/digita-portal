const ALLOWED_ORIGIN = "https://max791687.github.io";
const MAX_BODY_SIZE = 1024 * 1024;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const PBKDF2_ITERATIONS = 180000;
const ALLOWED_MEMBERS = {
  pavan: "Pavan",
  vijay: "Vijay",
  tushar: "Tushar",
  mirtunjay: "Mirtunjay",
  shweta: "Shweta",
  vanita: "Vanita",
  manoj: "Manoj",
  ashish: "Ashish"
};
const EDITABLE_MEMBER_FIELDS = ["status", "progress", "outputLink"];
const ALLOWED_STATUSES = ["pending", "in_progress", "changes_required", "completed"];

function jsonResponse(data, status, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Pragma": "no-cache"
  };
  if (origin === ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
    headers["Vary"] = "Origin";
    headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return new Response(JSON.stringify(data), { status: status, headers: headers });
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function utf8(value) {
  return new TextEncoder().encode(value);
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", utf8(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function derivePinHash(pin, salt) {
  const key = await crypto.subtle.importKey("raw", utf8(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: base64UrlToBytes(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return bytesToBase64Url(new Uint8Array(bits));
}
async function createPinCredentials(pin) {
  if (typeof pin !== "string" || pin.length < 6 || pin.length > 128) {
    throw new Error("PIN must be between 6 and 128 characters.");
  }
  const salt = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  return { salt: salt, hash: await derivePinHash(pin, salt) };
}
async function signSession(payload, secret) {
  const key = await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const body = bytesToBase64Url(utf8(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", key, utf8(body));
  return body + "." + bytesToBase64Url(new Uint8Array(signature));
}
async function verifySession(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const key = await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(parts[1]), utf8(parts[0]));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
    if (!payload || !payload.memberId || !payload.role || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}
async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_BODY_SIZE) throw Object.assign(new Error("Payload too large"), { status: 413 });
  const raw = await request.text();
  if (utf8(raw).length > MAX_BODY_SIZE) throw Object.assign(new Error("Payload too large"), { status: 413 });
  try { return JSON.parse(raw); } catch (_) { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}
function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function stripEditableFields(task) {
  const copy = { ...task };
  for (const field of EDITABLE_MEMBER_FIELDS) delete copy[field];
  return copy;
}
function isMemberTaskUpdateAllowed(previous, incoming, user) {
  if (!Array.isArray(previous) || !Array.isArray(incoming) || previous.length !== incoming.length) return false;
  const previousById = new Map(previous.map(t => [String(t && t.id), t]));
  const seen = new Set();
  for (const next of incoming) {
    if (!next || next.id == null) return false;
    const id = String(next.id);
    if (seen.has(id)) return false;
    seen.add(id);
    const old = previousById.get(id);
    if (!old) return false;
    if (normalizeName(old.assignedTo) !== normalizeName(user.displayName)) {
      if (JSON.stringify(old) !== JSON.stringify(next)) return false;
      continue;
    }
    if (JSON.stringify(stripEditableFields(old)) !== JSON.stringify(stripEditableFields(next))) return false;
    if (!ALLOWED_STATUSES.includes(next.status)) return false;
    if (next.progress !== undefined && (!Number.isInteger(next.progress) || next.progress < 0 || next.progress > 100)) return false;
    if (next.outputLink !== undefined && (typeof next.outputLink !== "string" || next.outputLink.length > 2048)) return false;
  }
  return seen.size === previousById.size;
}
function emptyWorkspace() {
  return { tasks: [], shoots: [], tools: [], notifications: [], activity: [], updatedAt: null, _revision: null };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);
    if (origin && origin !== ALLOWED_ORIGIN) return jsonResponse({ error: "Origin not allowed" }, 403, origin);

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return jsonResponse({ error: "Origin not allowed" }, 403, origin);
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
      }});
    }

    if (url.pathname === "/" && request.method === "GET") {
      return jsonResponse({ service: "Digital Team Sync API", status: "running" }, 200, origin);
    }
    if (!env.DB) return jsonResponse({ error: "D1 database binding missing" }, 500, origin);

    if (url.pathname === "/auth/setup" && request.method === "POST") {
      if (!env.BOOTSTRAP_SECRET || !env.SESSION_SECRET) return jsonResponse({ error: "Authentication secrets are not configured" }, 500, origin);
      try {
        const body = await readJson(request);
        if (!body || typeof body.bootstrapSecret !== "string" || typeof body.pin !== "string") return jsonResponse({ error: "Bootstrap secret and admin PIN are required" }, 400, origin);
        const expected = await sha256Hex(env.BOOTSTRAP_SECRET);
        const supplied = await sha256Hex(body.bootstrapSecret);
        if (expected !== supplied) return jsonResponse({ error: "Invalid bootstrap secret" }, 401, origin);
        const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM team_users").first();
        if (!count || Number(count.total) !== 0) return jsonResponse({ error: "Initial admin is already configured" }, 409, origin);
        const credentials = await createPinCredentials(body.pin);
        await env.DB.prepare("INSERT INTO team_users (member_id, display_name, role, pin_salt, pin_hash, active) VALUES (?, ?, 'admin', ?, ?, 1)")
          .bind("pavan", "Pavan", credentials.salt, credentials.hash).run();
        const session = await signSession({ memberId: "pavan", displayName: "Pavan", role: "admin", exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }, env.SESSION_SECRET);
        return jsonResponse({ success: true, token: session, user: { memberId: "pavan", displayName: "Pavan", role: "admin" } }, 201, origin);
      } catch (error) {
        return jsonResponse({ error: error.status === 413 ? error.message : "Could not complete admin setup" }, error.status || 500, origin);
      }
    }

    if (url.pathname === "/auth/login" && request.method === "POST") {
      if (!env.SESSION_SECRET) return jsonResponse({ error: "Session secret is not configured" }, 500, origin);
      try {
        const body = await readJson(request);
        const memberId = String(body && body.memberId || "").toLowerCase();
        const pin = body && body.pin;
        if (!ALLOWED_MEMBERS[memberId] || typeof pin !== "string") return jsonResponse({ error: "Invalid member ID or PIN" }, 401, origin);
        const row = await env.DB.prepare("SELECT member_id, display_name, role, pin_salt, pin_hash, active FROM team_users WHERE member_id = ?").bind(memberId).first();
        if (!row || Number(row.active) !== 1) return jsonResponse({ error: "Account is inactive or not created" }, 401, origin);
        const candidate = await derivePinHash(pin, row.pin_salt);
        if (candidate !== row.pin_hash) return jsonResponse({ error: "Invalid member ID or PIN" }, 401, origin);
        const token = await signSession({ memberId: row.member_id, displayName: row.display_name, role: row.role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }, env.SESSION_SECRET);
        return jsonResponse({ success: true, token: token, user: { memberId: row.member_id, displayName: row.display_name, role: row.role } }, 200, origin);
      } catch (error) {
        return jsonResponse({ error: error.status === 413 ? error.message : "Login failed" }, error.status || 500, origin);
      }
    }

    const authorization = request.headers.get("Authorization") || "";
    const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const user = env.SESSION_SECRET && bearer ? await verifySession(bearer, env.SESSION_SECRET) : null;
    if (!user) return jsonResponse({ error: "Login required or session expired" }, 401, origin);

    if (url.pathname === "/auth/users" && request.method === "GET") {
      if (user.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403, origin);
      const result = await env.DB.prepare("SELECT member_id, display_name, role, active, created_at FROM team_users ORDER BY display_name").all();
      return jsonResponse({ users: result.results || [] }, 200, origin);
    }

    if (url.pathname === "/auth/users" && request.method === "POST") {
      if (user.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403, origin);
      try {
        const body = await readJson(request);
        const memberId = String(body && body.memberId || "").toLowerCase();
        const pin = body && body.pin;
        if (!ALLOWED_MEMBERS[memberId] || memberId === "pavan" || typeof pin !== "string") return jsonResponse({ error: "Choose a valid team member and PIN" }, 400, origin);
        const credentials = await createPinCredentials(pin);
        await env.DB.prepare("INSERT INTO team_users (member_id, display_name, role, pin_salt, pin_hash, active) VALUES (?, ?, 'member', ?, ?, 1)")
          .bind(memberId, ALLOWED_MEMBERS[memberId], credentials.salt, credentials.hash).run();
        return jsonResponse({ success: true, memberId: memberId, displayName: ALLOWED_MEMBERS[memberId] }, 201, origin);
      } catch (error) {
        if (error.status) return jsonResponse({ error: error.message }, error.status, origin);
        return jsonResponse({ error: "Could not create member. The account may already exist." }, 409, origin);
      }
    }

    if (url.pathname === "/auth/users/reset-pin" && request.method === "POST") {
      if (user.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403, origin);
      try {
        const body = await readJson(request);
        const memberId = String(body && body.memberId || "").toLowerCase();
        if (!ALLOWED_MEMBERS[memberId] || typeof body.pin !== "string") return jsonResponse({ error: "Valid member ID and PIN are required" }, 400, origin);
        const credentials = await createPinCredentials(body.pin);
        const result = await env.DB.prepare("UPDATE team_users SET pin_salt = ?, pin_hash = ? WHERE member_id = ?")
          .bind(credentials.salt, credentials.hash, memberId).run();
        if (!result.meta || result.meta.changes !== 1) return jsonResponse({ error: "Member account not found" }, 404, origin);
        return jsonResponse({ success: true }, 200, origin);
      } catch (error) {
        return jsonResponse({ error: error.status ? error.message : "Could not reset PIN" }, error.status || 500, origin);
      }
    }

    if (url.pathname === "/auth/users/active" && request.method === "POST") {
      if (user.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403, origin);
      try {
        const body = await readJson(request);
        const memberId = String(body && body.memberId || "").toLowerCase();
        if (!ALLOWED_MEMBERS[memberId] || memberId === "pavan" || typeof body.active !== "boolean") return jsonResponse({ error: "Valid member and active value are required" }, 400, origin);
        const result = await env.DB.prepare("UPDATE team_users SET active = ? WHERE member_id = ?").bind(body.active ? 1 : 0, memberId).run();
        if (!result.meta || result.meta.changes !== 1) return jsonResponse({ error: "Member account not found" }, 404, origin);
        return jsonResponse({ success: true }, 200, origin);
      } catch (error) {
        return jsonResponse({ error: error.status ? error.message : "Could not update member" }, error.status || 500, origin);
      }
    }

    if (url.pathname !== "/workspace") return jsonResponse({ error: "Not found" }, 404, origin);
    if (request.method === "GET") {
      try {
        const row = await env.DB.prepare("SELECT data, updated_at FROM portal_data WHERE id = ?").bind("workspace").first();
        if (!row) return jsonResponse(emptyWorkspace(), 200, origin);
        const data = JSON.parse(row.data);
        return jsonResponse({ ...data, _revision: row.updated_at }, 200, origin);
      } catch (error) {
        console.error("D1 read failed:", error);
        return jsonResponse({ error: "Could not read workspace data" }, 500, origin);
      }
    }

    if (request.method === "PUT") {
      try {
        const data = await readJson(request);
        if (!data || typeof data !== "object" || Array.isArray(data) ||
          !Array.isArray(data.tasks) || !Array.isArray(data.shoots) ||
          !Array.isArray(data.tools) || !Array.isArray(data.notifications) ||
          !Array.isArray(data.activity)) return jsonResponse({ error: "Invalid workspace data" }, 400, origin);
        if (!Object.prototype.hasOwnProperty.call(data, "expectedRevision") ||
          !(data.expectedRevision === null || (typeof data.expectedRevision === "string" && data.expectedRevision.length > 0))) {
          return jsonResponse({ error: "Revision required. Please refresh the portal." }, 428, origin);
        }
        const row = await env.DB.prepare("SELECT data, updated_at FROM portal_data WHERE id = ?").bind("workspace").first();
        if (user.role !== "admin") {
          if (!row) return jsonResponse({ error: "Member workspace is not initialized" }, 409, origin);
          const previous = JSON.parse(row.data);
          if (data.expectedRevision !== row.updated_at) return jsonResponse({ error: "Data conflict detected. Latest cloud data was preserved.", conflict: true }, 409, origin);
          if (!isMemberTaskUpdateAllowed(previous.tasks, data.tasks, user)) return jsonResponse({ error: "Members may update only their own task status, progress and output link." }, 403, origin);
          const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
          if (!sameJson(previous.shoots, data.shoots) || !sameJson(previous.tools, data.tools) ||
            !sameJson(previous.notifications, data.notifications) || !sameJson(previous.activity, data.activity)) {
            return jsonResponse({ error: "Members cannot modify shoots, tools, notifications or activity records." }, 403, origin);
          }
        }
        const expectedRevision = data.expectedRevision;
        const previousRevisionTime = expectedRevision === null ? NaN : Date.parse(expectedRevision);
        const updatedAt = new Date(Number.isFinite(previousRevisionTime) ? Math.max(Date.now(), previousRevisionTime + 1) : Date.now()).toISOString();
        const workspaceData = { ...data };
        delete workspaceData.expectedRevision;
        delete workspaceData._revision;
        workspaceData.updatedAt = updatedAt;
        let result;
        if (expectedRevision === null) {
          result = await env.DB.prepare("INSERT INTO portal_data (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING")
            .bind("workspace", JSON.stringify(workspaceData), updatedAt).run();
        } else {
          result = await env.DB.prepare("UPDATE portal_data SET data = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
            .bind(JSON.stringify(workspaceData), updatedAt, "workspace", expectedRevision).run();
        }
        if (!result.meta || result.meta.changes !== 1) return jsonResponse({ error: "Data conflict detected. Latest cloud data was preserved.", conflict: true }, 409, origin);
        return jsonResponse({ success: true, revision: updatedAt, updatedAt: updatedAt }, 200, origin);
      } catch (error) {
        return jsonResponse({ error: error.status ? error.message : "Could not save workspace data" }, error.status || 500, origin);
      }
    }
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }
};