# Writer AI helper setup

The helper uses Cloudflare Workers AI via a binding; no API key or consumer subscription is used.

1. Open Cloudflare Workers & Pages → `digital-team-sync-staging` → Bindings → Add binding → Workers AI.
2. Set the binding variable name exactly to `AI`. Save/deploy the binding.
3. Replace the Worker's source with this branch's reviewed `worker.js` and deploy. Preserve the DB binding, secrets and all existing records.
4. Keep Workers on the Free plan for the requested zero-budget setup. This code does not change billing or enable paid fallback. On an already-paid plan, Cloudflare may bill provider overages; app attempt caps are not a billing cap.
5. Hard-refresh Pages. Open a script → AI Writing Helper. Enter a brief, choose the language, generate, inspect the suggestion and append only if wanted. Use Save script to sync it.
6. Test an admin and a writer, login enforcement, provider failures and the cooldown. Check Hindi/Hinglish output quality before team rollout.

## Behavior

- Model: `@cf/meta/llama-3.1-8b-instruct-fp8`. Fixed server-side; no paid-model fallback.
- Actions: draft, hooks/CTA, rewrite, shorten, translate, scene/B-roll suggestions.
- Only admin, Shweta and Vanita may call the endpoint. Existing session/active-account validation applies.
- Maximum 6,000 input characters and 700 generated tokens. Long scripts may need several passages.
- 10 attempts per user/day, 15-second per-user cooldown, 60 attempts per team/day. The provider's shared allowance can run out earlier.
- Limits reset at 00:00 UTC (05:30 IST). Failed, timed-out or cancelled requests may count.
- Atomic attempt counters are additional `portal_data` rows prefixed `writer_ai_usage:<date>:`. No schema migration; `workspace` and `team_users` are not modified by the AI endpoint. Only counts/timestamps are stored in these rows, not prompts or generated suggestions.
- Suggestion text stays outside the saved script until the writer explicitly appends and saves it. Changing the active script/account discards an in-flight response.
- Main-script selection or current text is copied into the source box only when requested. Research notes, briefs, other tasks and member records are not automatically sent to AI.
- Provider requests time out after 35 seconds at the API response boundary; provider work may continue after a cancellation. There is no automatic retry.

## Checks

`node tests/writer-ai.test.cjs`
`node tests/writer-permissions.test.cjs`
`node --check writer-studio.js`
`node --input-type=module --check < worker.js`

Live inference and output quality remain unverified until the AI binding is connected. Documentation: https://developers.cloudflare.com/workers-ai/configuration/bindings/
