# Production Pipeline and Review Board

Two tabs on the existing portal: Production Pipeline and Review Board. They operate on existing content tasks; no duplicate task collection or database migration.

## Workflow

Script → Shoot → Editing / Design → Review → Revision → Approved.

- Members open their own task, save a working stage/output link and submit for review.
- Scripts require saved script text before review. Other content requires an HTTP(S) output/review link.
- Admin reviews the output via its external link, reads scripts/scene breakdowns, adds feedback, requests revisions or approves.
- Admin can open the existing task editor to reassign the task/category for a handoff.
- Member filters, title/category search, stage counts and overdue indicators are available. Members default to their own work; they may view the existing shared team data, with other tasks' controls read-only.
- Review Board filters: Awaiting review, Changes requested, Approved.
- Approval sets status completed and progress 100. Revisions update the existing revision notes, requester and timestamp; writing tasks also update script feedback/review state.
- Writer Studio's save/submit/revise/approve actions update the pipeline. Existing task status/output controls also update working/review stages when appropriate.
- Updating an approved output requires reopening its working stage. An old approval's metadata may remain as history, but only the current Approved stage is considered approved.
- Historical completed tasks appear in Review until explicitly approved; no historical data is bulk rewritten.
- Review notes/link edits have account/task-scoped browser draft recovery. Cloud conflicts preserve existing revision-aware behavior; download a backup before resolving a conflict.

## Storage and authorization

Additional fields in existing task JSON: pipelineStage, reviewSubmittedAt, approvalAt, approvalBy. Existing revisionNotes/revisionBy/revisionAt and scriptReview/scriptFeedback are reused.

Members cannot approve, set approval metadata or edit admin feedback. They can move only their own tasks through working stages/review and change their existing allowed fields. New member-created tasks cannot pre-populate approval, submitted-review or admin-revision metadata. Existing calendar, authentication, AI binding and D1 schema stay intact.

## Deployment

1. Review and deploy this branch's worker.js to digital-team-sync-staging. Preserve DB, AI and all existing secrets/bindings.
2. Pages must serve index.html, production-pipeline.js and the updated writer-studio.js from feature/individual-member-access.
3. Hard refresh. Test one member submission, admin feedback/revision, member resubmission and admin approval; confirm refresh persistence and a second account sees the update.

The frontend requires the updated Worker for stage saves. No SQL or data reset is required.

## Validation

node tests/production-pipeline.test.cjs
node tests/writer-permissions.test.cjs
node tests/writer-ai.test.cjs
node --check production-pipeline.js
node --check writer-studio.js
node --input-type=module --check < worker.js

32 new state/permission checks, existing writer/AI tests, and browser QA with isolated sample data cover the feature. Live authenticated Cloudflare testing remains to be completed after Worker deployment.
