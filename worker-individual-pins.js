const ALLOWED_ORIGIN = "https://max791687.github.io";
const MAX_BODY_SIZE = 1024 * 1024;

const MEMBERS = [
  { id: "Pavan", name: "Pavan", role: "admin", secret: "TEAM_PIN" },
  { id: "Vijay", name: "Vijay", role: "member", secret: "PIN_VIJAY" },
  { id: "Tushar", name: "Tushar", role: "member", secret: "PIN_TUSHAR" },
  { id: "Mirtunjay", name: "Mirtunjay", role: "member", secret: "PIN_MIRTUNJAY" },
  { id: "Shweta", name: "Shweta", role: "member", secret: "PIN_SHWETA" },
  { id: "Vanita", name: "Vanita", role: "member", secret: "PIN_VANITA" },
  { id: "Manoj", name: "Manoj", role: "member", secret: "PIN_MANOJ" },
  { id: "Ashish", name: "Ashish", role: "member", secret: "PIN_ASHISH" },
];

const MEMBER_EDITABLE_FIELDS = [
  "title", "category", "assignedDate", "dueDate",
  "scriptText", "docLink", "status", "outputLink"
];

function jsonResponse(data, status, origin = "") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (origin === ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
    headers["Vary"] = "Origin";
    headers["Access-Control-Allow-Methods"] = "GET, PUT, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = canonical(value[key]);
      return out;
    }, {});
  }
  return value;
}

function same(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";
  const pin = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!pin) return null;
  for (const member of MEMBERS) {
    const secret = env[member.secret];
    if (typeof secret === "string" && secret.length > 0 && pin === secret) {
      return { id: member.id, name: member.name, role: member.role };
    }
  }
  return null;
}

function validateWorkspace(data) {
  return !!data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Array.isArray(data.tasks) &&
    Array.isArray(data.shoots) &&
    Array.isArray(data.tools) &&
    Array.isArray(data.notifications) &&
    Array.isArray(data.activity);
}

function applyMemberTaskChanges(existingTasks, incomingTasks, user) {
  if (incomingTasks.length !== existingTasks.length) {
    return { error: "Members cannot add or delete tasks." };
  }

  const existingById = new Map();
  for (const task of existingTasks) {
    if (!task || task.id == null || existingById.has(String(task.id))) {
      return { error: "Stored task data is invalid. Ask the admin to review it." };
    }
    existingById.set(String(task.id), task);
  }

  const seen = new Set();
  const merged = [];
  for (const incoming of incomingTasks) {
    if (!incoming || incoming.id == null) {
      return { error: "Every task must have a valid ID." };
    }
    const id = String(incoming.id);
    if (seen.has(id) || !existingById.has(id)) {
      return { error: "Members cannot add, remove, or duplicate tasks." };
    }
    seen.add(id);

    const original = existingById.get(id);
    if (original.assignedTo !== user.name) {
      if (!same(original, incoming)) {
        return { error: "You can only edit tasks assigned to you." };
      }
      merged.push(original);
      continue;
    }

    const originalLocked = { ...original };
    const incomingLocked = { ...incoming };
    for (const field of MEMBER_EDITABLE_FIELDS) {
      delete originalLocked[field];
      delete incomingLocked[field];
    }
    if (!same(originalLocked, incomingLocked)) {
      return { error: "You cannot change task ownership, assignment, or protected task fields." };
    }

    const updated = { ...original };
    for (const field of MEMBER_EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(incoming, field)) {
        updated[field] = incoming[field];
      } else {
        delete updated[field];
      }
    }
    merged.push(updated);
  }

  if (seen.size !== existingById.size) {
    return { error: "Members cannot remove tasks." };
  }
  return { tasks: merged };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (origin && origin !== ALLOWED_ORIGIN) {
      return jsonResponse({ error: "Origin not allowed" }, 403);
    }

    if (url.pathname === "/" && request.method === "GET") {
      return jsonResponse({ service: "Digital Team Sync API", status: "running" }, 200, origin);
    }

    if (url.pathname !== "/workspace") {
      return jsonResponse({ error: "Not found" }, 404, origin);
    }

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return jsonResponse({ error: "Origin not allowed" }, 403);
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin",
        },
      });
    }

    if (origin !== ALLOWED_ORIGIN) {
      return jsonResponse({ error: "Website origin required" }, 403, origin);
    }

    if (!env.DB || !env.TEAM_PIN) {
      return jsonResponse({ error: "Worker configuration incomplete" }, 500, origin);
    }

    const user = authenticate(request, env);
    if (!user) return jsonResponse({ error: "Invalid Team PIN" }, 401, origin);

    if (request.method === "GET") {
      try {
        const row = await env.DB.prepare(
          "SELECT data, updated_at FROM portal_data WHERE id = ?"
        ).bind("workspace").first();

        if (!row) {
          return jsonResponse({
            tasks: [], shoots: [], tools: [], notifications: [], activity: [],
            updatedAt: null, _revision: null, user
          }, 200, origin);
        }

        const data = JSON.parse(row.data);
        return jsonResponse({ ...data, _revision: row.updated_at, user }, 200, origin);
      } catch (error) {
        console.error("D1 read failed:", error);
        return jsonResponse({ error: "Could not read workspace data" }, 500, origin);
      }
    }

    if (request.method === "PUT") {
      const contentLength = Number(request.headers.get("Content-Length") || 0);
      if (contentLength > MAX_BODY_SIZE) {
        return jsonResponse({ error: "Payload too large" }, 413, origin);
      }

      try {
        const rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).length > MAX_BODY_SIZE) {
          return jsonResponse({ error: "Payload too large" }, 413, origin);
        }

        const incoming = JSON.parse(rawBody);
        if (!validateWorkspace(incoming)) {
          return jsonResponse({ error: "Invalid workspace data" }, 400, origin);
        }
        if (!Object.prototype.hasOwnProperty.call(incoming, "expectedRevision") ||
          !(incoming.expectedRevision === null ||
            (typeof incoming.expectedRevision === "string" && incoming.expectedRevision.length > 0))) {
          return jsonResponse({ error: "Revision required. Please refresh the portal." }, 428, origin);
        }

        const current = await env.DB.prepare(
          "SELECT data, updated_at FROM portal_data WHERE id = ?"
        ).bind("workspace").first();

        if (!current) {
          if (user.role !== "admin" || incoming.expectedRevision !== null) {
            return jsonResponse({ error: "Workspace is not initialized. Ask the admin to open the portal first." }, 403, origin);
          }
        } else if (incoming.expectedRevision !== current.updated_at) {
          return jsonResponse({
            error: "Data conflict detected. Latest cloud data was preserved.",
            conflict: true
          }, 409, origin);
        }

        let workspaceData;
        if (user.role === "admin") {
          workspaceData = { ...incoming };
        } else {
          if (!current) return jsonResponse({ error: "Admin must initialize the workspace first." }, 403, origin);
          const existingData = JSON.parse(current.data);
          const result = applyMemberTaskChanges(existingData.tasks || [], incoming.tasks, user);
          if (result.error) return jsonResponse({ error: result.error }, 403, origin);
          workspaceData = {
            ...existingData,
            tasks: result.tasks
          };
        }

        delete workspaceData.expectedRevision;
        delete workspaceData._revision;
        delete workspaceData.user;

        const priorTime = current ? Date.parse(current.updated_at) : NaN;
        const updatedAt = new Date(
          Number.isFinite(priorTime) ? Math.max(Date.now(), priorTime + 1) : Date.now()
        ).toISOString();
        workspaceData.updatedAt = updatedAt;

        let result;
        if (!current) {
          result = await env.DB.prepare(`
            INSERT INTO portal_data (id, data, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO NOTHING
          `).bind("workspace", JSON.stringify(workspaceData), updatedAt).run();
        } else {
          result = await env.DB.prepare(`
            UPDATE portal_data
            SET data = ?, updated_at = ?
            WHERE id = ? AND updated_at = ?
          `).bind(JSON.stringify(workspaceData), updatedAt, "workspace", incoming.expectedRevision).run();
        }

        if (!result.meta || result.meta.changes !== 1) {
          return jsonResponse({
            error: "Data conflict detected. Latest cloud data was preserved.",
            conflict: true
          }, 409, origin);
        }

        return jsonResponse({ success: true, revision: updatedAt, updatedAt, user }, 200, origin);
      } catch (error) {
        if (error instanceof SyntaxError) return jsonResponse({ error: "Invalid JSON" }, 400, origin);
        console.error("D1 write failed:", error);
        return jsonResponse({ error: "Could not save workspace data" }, 500, origin);
      }
    }

    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  },
};
