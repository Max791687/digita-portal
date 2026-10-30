const ALLOWED_ORIGIN = "https://max791687.github.io";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const MEMBERS = ["Vijay", "Tushar", "Mirtunjay", "Shweta", "Vanita", "Manoj", "Ashish"];

function json(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin"
    }
  });
}
function cors(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    }
  });
}
function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromB64url(value) {
  const s = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "=".repeat((4 - s.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}
async function issueToken(member, role, secret) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ member, role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })));
  return payload + "." + await sign(payload, secret);
}
async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const parts = token.split(".");
  if (parts.length !== 2 || !env.SESSION_SECRET) return null;
  const expected = await sign(parts[0], env.SESSION_SECRET);
  if (expected !== parts[1]) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    if (!payload.member || !payload.role || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.role === "admin" && payload.member !== "Pavan") return null;
    if (payload.role === "member" && !MEMBERS.includes(payload.member)) return null;
    return { member: payload.member, role: payload.role };
  } catch { return null; }
}
async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function readWorkspace(env) {
  const row = await env.DB.prepare("SELECT data FROM portal_data WHERE id = ?").bind("workspace").first();
  if (!row) return { tasks: [], shoots: [], tools: [], notifications: [], activity: [], updatedAt: Date.now() };
  const data = JSON.parse(row.data);
  return {
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    shoots: Array.isArray(data.shoots) ? data.shoots : [],
    tools: Array.isArray(data.tools) ? data.tools : [],
    notifications: Array.isArray(data.notifications) ? data.notifications : [],
    activity: Array.isArray(data.activity) ? data.activity : [],
    updatedAt: data.updatedAt || Date.now()
  };
}
async function saveWorkspace(env, data) {
  await env.DB.prepare(
    "INSERT INTO portal_data (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
  ).bind("workspace", JSON.stringify(data), new Date().toISOString()).run();
}
function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function isAppendOnly(oldItems, newItems) {
  if (!Array.isArray(newItems) || newItems.length < oldItems.length) return false;
  return oldItems.every((item, i) => sameJson(item, newItems[i]));
}
function authorizeMemberTaskChanges(oldTasks, newTasks, member) {
  if (!Array.isArray(newTasks) || oldTasks.length !== newTasks.length) return false;
  const oldById = new Map(oldTasks.map(t => [String(t.id), t]));
  const newById = new Map(newTasks.map(t => [String(t.id), t]));
  if (oldById.size !== oldTasks.length || newById.size !== newTasks.length) return false;
  if ([...oldById.keys()].some(id => !newById.has(id))) return false;
  for (const [id, oldTask] of oldById) {
    const next = newById.get(id);
    if (oldTask.assignedTo !== member) {
      if (!sameJson(oldTask, next)) return false;
      continue;
    }
    if (next.assignedTo !== oldTask.assignedTo || next.id !== oldTask.id || next.createdAt !== oldTask.createdAt) return false;
  }
  return true;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return cors(request);
    if (origin && origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed" }, 403);
    const url = new URL(request.url);

    if (url.pathname === "/auth/login" && request.method === "POST") {
      if (!env.SESSION_SECRET) return json({ error: "SESSION_SECRET is not configured" }, 503);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      const member = String(body.member || "").trim();
      const pin = String(body.pin || "");
      if (!member || !pin || pin.length > 128) return json({ error: "Enter your member name and PIN" }, 400);

      let role = "";
      if (member === "Pavan" && env.TEAM_PIN && safeEqual(pin, env.TEAM_PIN)) {
        role = "admin";
      } else if (MEMBERS.includes(member)) {
        let configured = {};
        try { configured = JSON.parse(env.MEMBER_PINS_JSON || "{}"); } catch { return json({ error: "Member PIN configuration is invalid" }, 503); }
        const expectedHash = configured[member];
        if (typeof expectedHash === "string" && safeEqual((await sha256Hex(pin)).toLowerCase(), expectedHash.toLowerCase())) role = "member";
      }
      if (!role) return json({ error: "Incorrect member name or PIN" }, 401);
      const token = await issueToken(member, role, env.SESSION_SECRET);
      return json({ token, member, role, expiresIn: SESSION_TTL_SECONDS });
    }

    const session = await authenticate(request, env);
    if (!session) return json({ error: "Login expired or invalid. Please sign in again." }, 401);

    if (url.pathname !== "/workspace") return json({ error: "Not found" }, 404);
    if (request.method === "GET") return json(await readWorkspace(env));
    if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);

    let incoming;
    try { incoming = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!incoming || !Array.isArray(incoming.tasks) || !Array.isArray(incoming.shoots) ||
        !Array.isArray(incoming.tools) || !Array.isArray(incoming.notifications) || !Array.isArray(incoming.activity)) {
      return json({ error: "Workspace data is incomplete" }, 400);
    }

    const current = await readWorkspace(env);
    let next;
    if (session.role === "admin") {
      next = {
        tasks: incoming.tasks,
        shoots: incoming.shoots,
        tools: incoming.tools,
        notifications: incoming.notifications,
        activity: incoming.activity.slice(0, 5000),
        updatedAt: Date.now()
      };
    } else {
      if (!authorizeMemberTaskChanges(current.tasks, incoming.tasks, session.member)) {
        return json({ error: "Members can only edit their own assigned task. Tasks cannot be deleted or reassigned." }, 403);
      }
      if (!sameJson(current.shoots, incoming.shoots) || !sameJson(current.tools, incoming.tools) ||
          !isAppendOnly(current.notifications, incoming.notifications) || !isAppendOnly(current.activity, incoming.activity)) {
        return json({ error: "Only your assigned task can be updated. Shared workspace settings are admin-only." }, 403);
      }
      next = {
        ...current,
        tasks: incoming.tasks,
        notifications: incoming.notifications.slice(0, 100),
        activity: incoming.activity.slice(0, 5000),
        updatedAt: Date.now()
      };
    }
    await saveWorkspace(env, next);
    return json({ ok: true, updatedAt: next.updatedAt, role: session.role });
  }
};
