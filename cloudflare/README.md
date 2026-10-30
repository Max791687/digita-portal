# Digital Portal — Individual PIN Login & Task Permissions

This change is intentionally staged on a feature branch. It does not deploy the Cloudflare Worker or change the live site.

## Roles

- Pavan: Admin (uses the existing Cloudflare Worker secret `TEAM_PIN`).
- Vijay, Tushar, Mirtunjay, Shweta, Vanita, Manoj, Ashish: Member.
- Members can update any fields on tasks assigned to them, but cannot delete or reassign tasks.
- Members cannot create tasks, edit another member's task, or change shared shoots/tools.
- Only Admin can create, delete, reassign, and manage shared workspace data.

## Cloudflare Worker setup

Worker source: `cloudflare/worker.js`

### 1. Confirm D1 table

The Worker expects the existing D1 binding named `DB` and this table:

```sql
CREATE TABLE IF NOT EXISTS portal_data (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Run this in the D1 Console only if the table does not already exist. Do not drop or recreate the table.

### 2. Configure Worker secrets

Keep the existing `TEAM_PIN` secret as Pavan's Admin PIN.

Create two additional Worker secrets:
- `SESSION_SECRET`: a long random secret (at least 32 random bytes, generated privately).
- `MEMBER_PINS_JSON`: JSON object mapping each member name to the SHA-256 hex hash of their own PIN.

Example structure (replace every example hash; never paste real PINs into GitHub):
```json
{
  "Vijay": "SHA256_HASH_OF_VIJAY_PIN",
  "Tushar": "SHA256_HASH_OF_TUSHAR_PIN",
  "Mirtunjay": "SHA256_HASH_OF_MIRTUNJAY_PIN",
  "Shweta": "SHA256_HASH_OF_SHWETA_PIN",
  "Vanita": "SHA256_HASH_OF_VANITA_PIN",
  "Manoj": "SHA256_HASH_OF_MANOJ_PIN",
  "Ashish": "SHA256_HASH_OF_ASHISH_PIN"
}
```

Generate each hash locally with Node.js (do not use an online hash website):
```js
const { createHash } = require("node:crypto");
console.log(createHash("sha256").update("YOUR_MEMBER_PIN").digest("hex"));
```

Use a unique PIN per person (prefer 8+ digits). Store the JSON as a Cloudflare Worker secret, not as a plain-text variable or in this repository. The worker never returns the hashes.

### 3. Deploy Worker only after review

Paste `cloudflare/worker.js` into the Cloudflare Worker editor, save, and deploy only after the D1 table and all secrets are configured. The current website frontend still uses the old shared-PIN API and must not be switched until the matching frontend login update is complete.

## API

- `POST /auth/login` with `{ "member": "Vijay", "pin": "..." }` returns a signed 12-hour session token.
- `GET /workspace` requires `Authorization: Bearer <session-token>`.
- `PUT /workspace` requires a session token and applies role checks on the server.

Tokens are HMAC-SHA256 signed with `SESSION_SECRET`. Member writes are checked against the current D1 workspace, not the browser's claimed identity.

## Important

Do not deploy this Worker alone while the live frontend still sends the old shared Team PIN. Deploy the frontend and Worker as a coordinated change after the backend secrets are configured and the current D1 data is backed up.
