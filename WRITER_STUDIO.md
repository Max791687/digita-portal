# Writer Studio

Uses existing `tasks`, workspace revision checks and portal backups. No D1 migration.

- Admin assigns SCRIPT WRITING tasks to Shweta or Vanita, with title, due date and brief.
- Assigned writers save scriptText and submit scriptReview (`draft` / `submitted`).
- Admin adds feedback, requests changes, or approves. Approval completes the task.
- Local drafts are account/task scoped. Cloud save success is explicitly confirmed.
- Script editor supports plain text Hindi/English/Hinglish, a template, word count and .txt export.

## Deployment

1. Deploy reviewed `worker.js` to the Worker configured in `index.html`: `digital-team-sync-staging`.
2. Preserve existing DB binding, secrets and D1 data. No SQL changes needed.
3. Deploy Pages from `feature/individual-member-access`, including `writer-studio.js`.
4. Verify admin assignment, Shweta/Vanita own-task saving, submitted scripts, admin feedback/revisions/approval, cross-account restrictions, refresh persistence, conflicting edits, and existing calendar/task features.

If the frontend deploys first, old Worker permissions reject writer script saves; the browser draft remains available. Deploy the updated Worker before team use.

## Validation

`node tests/writer-permissions.test.cjs`
`node --check writer-studio.js`
`node --input-type=module --check < worker.js`

Automated checks cover writer ownership, protected metadata, review spoofing, script size, empty submissions and existing task permissions. Signed-in browser checks and live Worker deployment still require environment access.
