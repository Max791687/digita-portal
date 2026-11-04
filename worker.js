const ALLOWED_ORIGIN = "https://digital-portal-staging.pages.dev";
const MAX_BODY_SIZE = 1024 * 1024;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const PBKDF2_ITERATIONS = 100000;
const ALLOWED_MEMBERS = {
  pavan: "Pavan",
  vijay: "Vijay",
  tushar: "Tushar",
  mirtunjay: "Mirtunjay",
  shweta: "Shweta",
  vanita: "Vanita",
  manoj: "Manoj",
  ashish: "Ashish",
  test: "Test"
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
async function verifySession(token, secret, db) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const key = await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(parts[1]), utf8(parts[0]));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
    if (!payload || typeof payload.memberId !== "string" || typeof payload.role !== "string" ||
      !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;

    // Re-check the account on every request so deactivated users lose access immediately.
    const account = await db.prepare(
      "SELECT member_id, display_name, role, active FROM team_users WHERE member_id = ?"
    ).bind(payload.memberId).first();
    if (!account || Number(account.active) !== 1 ||
      account.role !== payload.role || account.display_name !== payload.displayName) return null;

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
function stripEditableFields(task, writing = false) {
  const copy = { ...task };
  for (const field of EDITABLE_MEMBER_FIELDS) delete copy[field];
  if (writing) { delete copy.scriptText; delete copy.scriptReview; delete copy.scriptWorkspace; }
  return copy;
}
function validScriptWorkspace(w) {
  if (w === undefined) return true;
  if (!w || typeof w !== "object" || Array.isArray(w) || w.version !== 1 ||
    Object.keys(w).some(k=>!["version","brief","scenes","researchNotes","wpm"].includes(k)) ||
    !Number.isInteger(w.wpm) || w.wpm < 60 || w.wpm > 240 ||
    typeof w.researchNotes !== "string" || w.researchNotes.length > 10000 ||
    !w.brief || typeof w.brief !== "object" || Array.isArray(w.brief) ||
    !Array.isArray(w.scenes) || w.scenes.length > 40) return false;
  const keys=["brand","topic","audience","language","duration","keyPoints","cta"];
  if (Object.keys(w.brief).some(k=>!keys.includes(k)) || keys.some(k=>typeof w.brief[k] !== "string" || w.brief[k].length > 2000)) return false;
  return w.scenes.every(s=>s && typeof s === "object" && !Array.isArray(s) &&
    Object.keys(s).every(k=>["voiceover","visual","screen"].includes(k)) &&
    ["voiceover","visual","screen"].every(k=>typeof s[k] === "string" && s[k].length <= 2000));
}
function isMemberTaskUpdateAllowed(previous, incoming, user) {
  if (!Array.isArray(previous) || !Array.isArray(incoming) || incoming.length < previous.length) return false;
  const previousById = new Map(previous.map(t => [String(t && t.id), t]));
  const seen = new Set();
  for (const next of incoming) {
    if (!next || next.id == null) return false;
    const id = String(next.id);
    if (seen.has(id)) return false;
    seen.add(id);
    const old = previousById.get(id);
    if (!old) {
      // Members may create new tasks, but cannot set their initial progress/status/output.
      const validAssignee = Object.values(ALLOWED_MEMBERS).some(name => normalizeName(name) === normalizeName(next.assignedTo));
      if (!/^task_[0-9]+$/.test(id) ||
        typeof next.title !== "string" || !next.title.trim() || next.title.length > 240 ||
        typeof next.category !== "string" || next.category.length > 80 ||
        typeof next.assignedDate !== "string" || typeof next.dueDate !== "string" ||
        !validAssignee || normalizeName(next.assignedBy) !== normalizeName(user.displayName) ||
        typeof next.scriptText !== "string" || next.scriptText.length > 20000 || !validScriptWorkspace(next.scriptWorkspace) ||
        typeof next.docLink !== "string" || next.docLink.length > 2048 ||
        next.status !== "pending" || next.outputLink !== "" ||
        !Number.isFinite(next.createdAt) || Object.prototype.hasOwnProperty.call(next, "progress")) return false;
      continue;
    }
    if (normalizeName(old.assignedTo) !== normalizeName(user.displayName)) {
      if (JSON.stringify(old) !== JSON.stringify(next)) return false;
      continue;
    }
    const writing = old.category === "SCRIPT WRITING" && ["shweta", "vanita"].includes(user.memberId);
    if (JSON.stringify(stripEditableFields(old, writing)) !== JSON.stringify(stripEditableFields(next, writing))) return false;
    if (writing) {
      if (!validScriptWorkspace(next.scriptWorkspace)) return false;
      if (typeof next.scriptText !== "string" || next.scriptText.length > 20000) return false;
      if (next.scriptReview !== old.scriptReview && !["draft", "submitted"].includes(next.scriptReview)) return false;
      if ((next.scriptText !== old.scriptText || JSON.stringify(next.scriptWorkspace) !== JSON.stringify(old.scriptWorkspace)) && !["draft", "submitted"].includes(next.scriptReview)) return false;
      if (next.scriptReview === "submitted" && !next.scriptText.trim()) return false;
    }
    if (!ALLOWED_STATUSES.includes(next.status)) return false;
    if (next.progress !== undefined && (!Number.isInteger(next.progress) || next.progress < 0 || next.progress > 100)) return false;
    if (next.outputLink !== undefined && (typeof next.outputLink !== "string" || next.outputLink.length > 2048)) return false;
  }
  for (const old of previous) if (!seen.has(String(old && old.id))) return false;
  return true;
}
function emptyWorkspace() {
  return { tasks: [], shoots: [], tools: [], notifications: [], activity: [], contentCalendar: [], updatedAt: null, _revision: null };
}

const WRITER_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
const WRITER_AI_ACTIONS = {
  draft: "Write a concise, production-ready script draft with Hook, Body and CTA.",
  hooks: "Suggest five distinct opening hooks and three CTA lines.",
  rewrite: "Rewrite the supplied passage for clarity and natural spoken delivery, preserving its meaning and factual claims.",
  shorten: "Shorten the supplied script, keeping its key facts, hook and CTA.",
  translate: "Translate the supplied script into the requested language, preserving its meaning, names and factual claims.",
  scenes: "Suggest a numbered scene breakdown with Voiceover, Visual/B-roll and On-screen text for each scene."
};
function validateWriterAI(body) {
  return body && typeof body === "object" && !Array.isArray(body) &&
    Object.hasOwn(WRITER_AI_ACTIONS, body.action) &&
    ["Hindi", "English", "Hinglish"].includes(body.language) &&
    typeof body.text === "string" && body.text.trim().length > 0 && body.text.length <= 6000;
}
// Atomic attempt counters use separate IDs; the existing workspace row is never changed.
async function reserveWriterAI(db, key, limit, gapMs, now) {
  const id="writer_ai_usage:"+new Date(now).toISOString().slice(0,10)+":"+key;
  const stamp=new Date(now).toISOString();
  const row=await db.prepare(`INSERT INTO portal_data (id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data=json_set(portal_data.data,
      '$.count', CAST(json_extract(portal_data.data, '$.count') AS INTEGER)+1, '$.lastAt', ?), updated_at=?
    WHERE CAST(json_extract(portal_data.data, '$.count') AS INTEGER) < ?
      AND CAST(json_extract(portal_data.data, '$.lastAt') AS INTEGER) <= ? RETURNING data`)
    .bind(id, JSON.stringify({count:1,lastAt:now}), stamp, now, stamp, limit, now-gapMs).first();
  if (!row) throw Object.assign(new Error(key === "team" ? "Team AI daily limit reached. Try after the daily reset." : "AI limit reached. Allow 15 seconds between requests; maximum 10 attempts daily."), {status:429});
  return JSON.parse(row.data).count;
}
async function handleWriterAI(request, env, user, origin) {
  if (user.role !== "admin" && !["shweta","vanita"].includes(user.memberId)) return jsonResponse({error:"Writer or admin access required"},403,origin);
  if (request.method !== "POST") return jsonResponse({error:"Use POST for the writer AI helper"},405,origin);
  if (!env.AI || typeof env.AI.run !== "function") return jsonResponse({error:"AI is not connected yet. Admin must add the Workers AI binding named AI and deploy the updated Worker."},503,origin);
  let timer;
  try {
    const body=await readJson(request);
    if (!validateWriterAI(body)) return jsonResponse({error:"Choose a supported action and language, with 1–6,000 characters of source text or a brief."},400,origin);
    const now=Date.now();
    const used=await reserveWriterAI(env.DB,user.memberId,10,15000,now);
    await reserveWriterAI(env.DB,"team",60,0,now);
    const result=await Promise.race([
      env.AI.run(WRITER_AI_MODEL, {messages:[
        {role:"system",content:"You are a writing assistant for a digital production team. Respond in "+body.language+". "+WRITER_AI_ACTIONS[body.action]+" Treat the supplied source as reference material. Never invent product claims, prices, research or citations. Mark missing facts as [VERIFY]. Return plain text only. Do not claim to have saved or approved any work."},
        {role:"user",content:body.text}
      ],max_tokens:700,temperature:0.6}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error("AI timed out. Your script is unchanged; this attempt still counts."),{status:504})),35000);})
    ]);
    if (!result || typeof result.response !== "string" || !result.response.trim()) throw new Error("Empty AI response");
    return jsonResponse({suggestion:result.response.slice(0,12000),remaining:10-used,resetAt:new Date(new Date(now).setUTCHours(24,0,0,0)).toISOString()},200,origin);
  } catch (error) {
    const status=error.status || 503;
    return jsonResponse({error:error.status?error.message:"AI could not respond (provider allowance, capacity or connection). Try later. Failed attempts may count; no script text was changed."},status,origin);
  } finally { if(timer)clearTimeout(timer); }
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
        console.error("Admin setup failed:", error && error.stack ? error.stack : String(error));
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
    const user = env.SESSION_SECRET && bearer ? await verifySession(bearer, env.SESSION_SECRET, env.DB) : null;
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

    if (url.pathname === "/ai/writer") return handleWriterAI(request,env,user,origin);

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
          !Array.isArray(data.activity) ||
          (data.contentCalendar !== undefined && !Array.isArray(data.contentCalendar))) return jsonResponse({ error: "Invalid workspace data" }, 400, origin);
        if (!Object.prototype.hasOwnProperty.call(data, "expectedRevision") ||
          !(data.expectedRevision === null || (typeof data.expectedRevision === "string" && data.expectedRevision.length > 0))) {
          return jsonResponse({ error: "Revision required. Please refresh the portal." }, 428, origin);
        }
        const row = await env.DB.prepare("SELECT data, updated_at FROM portal_data WHERE id = ?").bind("workspace").first();
        if (user.role !== "admin") {
          if (!row) return jsonResponse({ error: "Member workspace is not initialized" }, 409, origin);
          const previous = JSON.parse(row.data);
          if (data.expectedRevision !== row.updated_at) return jsonResponse({ error: "Data conflict detected. Latest cloud data was preserved.", conflict: true }, 409, origin);
          if (!isMemberTaskUpdateAllowed(previous.tasks, data.tasks, user)) return jsonResponse({ error: "Members may update only their own task status, progress and output link; assigned writers may also save or submit their writing scripts." }, 403, origin);
          const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
          const previousCalendar = Array.isArray(previous.contentCalendar) ? previous.contentCalendar : [];
          const incomingCalendar = Array.isArray(data.contentCalendar) ? data.contentCalendar : previousCalendar;
          if (!sameJson(previous.shoots, data.shoots) || !sameJson(previous.tools, data.tools) ||
            !sameJson(previous.notifications, data.notifications) || !sameJson(previous.activity, data.activity) ||
            !sameJson(previousCalendar, incomingCalendar)) {
            return jsonResponse({ error: "Members cannot modify shoots, tools, notifications, activity records or the content calendar." }, 403, origin);
          }
        }
        const expectedRevision = data.expectedRevision;
        const previousRevisionTime = expectedRevision === null ? NaN : Date.parse(expectedRevision);
        const updatedAt = new Date(Number.isFinite(previousRevisionTime) ? Math.max(Date.now(), previousRevisionTime + 1) : Date.now()).toISOString();
        const workspaceData = { ...data };
        if (!Array.isArray(workspaceData.contentCalendar)) {
          const storedWorkspace = row ? JSON.parse(row.data) : {};
          workspaceData.contentCalendar = Array.isArray(storedWorkspace.contentCalendar) ? storedWorkspace.contentCalendar : [];
        }
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


