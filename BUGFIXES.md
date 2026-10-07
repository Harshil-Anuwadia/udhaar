# Bug fixes and verification

Outcome: **fixed in the working tree**. All 17 confirmed audit findings are
addressed, together with the shared-history deletion issue. These changes have
not been deployed.

| Finding | Resulting behavior |
| --- | --- |
| B01 — unpaid Plus activation | Profile edits reject `plan`; entitlement changes stay in verified billing. Normal profile settings remain editable. |
| B02 — payment replay | Orders retain purchaser, amount, currency, and a unique payment ID. Only an authenticated owner's signed, captured payment with matching provider details activates Plus. Identical confirmations are safe to retry. |
| B03 — split conversion restores paid debt | Outstanding entries and paid fragments convert once. Historical split shares no longer overwrite the remaining debt. Both payer types are covered. |
| B04 — incompatible shared currencies | Links require matching currencies. Conversion checks incoming and outgoing shared money and existing linked counterparts. New money also checks compatibility inside its transaction. |
| B05 — duplicate links double totals | Claims reject a second linked page for the same account pair. A database uniqueness constraint backs this rule; existing duplicate links are consolidated without deleting private pages. |
| B06 — survivor loses shared history | Friend/account deletion retains the survivor's previously visible ledger records with their direction reversed. Private Moments and the deleted author's receipt photos are not copied. |
| B07 — partial-payment Undo | Settlements record their preceding state and fragment. Undo restores the obligation and removes the fragment atomically. The UI targets its exact settlement; stale actions are rejected and successful Undo retries are harmless. |
| B08 — partial settlement commits or races | Settlement reads, validation, fragment creation, and remaining-debt updates share a write transaction. Excess or zero money payments are rejected; database constraints prohibit negative writes. |
| B09 — mixed-case email login | New emails normalize consistently; signup and login compare case-insensitively. Case-variant duplicate contacts are rejected. |
| B10 — refresh replay | Rotation atomically consumes one token and issues exactly one returned successor. Concurrent consumption succeeds once. |
| B11 — logout affects other phones | Logout revokes only the current device's refresh lineage, including a successor created by an in-flight refresh. Other devices retain their sessions. Cookie and JSON token transports work. |
| B12 — retries duplicate debt | The client generates a mutation ID before sending. The server records the request fingerprint and result in the same transaction as creation. Retries return the original result; changed payloads conflict and deleted records are not recreated. |
| B13 — flush erases newly queued work | Every pending write has its own durable storage key. Flush removes only acknowledged records and preserves concurrent additions. |
| B14 — queue uses another account | Pending records retain their account owner. Replay skips other accounts and stops across account changes, including a refresh that changes identity. Signing out preserves the original account's pending work. |
| B15 — incomplete export | Export uses a dedicated complete-ledger read. CSV and JSON include all accessible entries rather than the first 200. |
| B16 — failed deletion claims success | Failed deletion retains the signed-in view and retryable confirmation. Erasure success appears only after server confirmation. |
| B17 — partially committed invite signup | Account creation, invite consumption, and linking share one transaction. Conflicts return a controlled error with no committed account or consumed code. Existing private handle matches are not automatically shared. |
| B18 — queue evicts older entries | All accepted pending records remain stored. Storage exhaustion is explicit before sending and never reports an unsaved write as saved. |

## Compatibility and migrations

Schema initialization adds payment orders, creation mutation receipts, settlement
records, entry versions, and refresh-session lineage. It also adds the linked-pair
unique index and nonnegative-write guards for existing entry tables.

For duplicate linked pages, ledger entries, link/event references, group
membership, payer references, and split shares consolidate onto one canonical
page. The other pages remain private with their notes and Moments. Migration
tests verify preservation and repeated initialization.

Legacy refresh records receive distinct device lineages without changing their
token hashes. Legacy case-colliding email accounts remain recoverable by unique
handle; ambiguous email login asks for that handle instead of merging accounts.

Checkouts opened before the order table existed can recover ownership from the
provider's original server-generated purchaser receipt. Client-provided ownership
claims are never accepted. The Plus view saves an unconfirmed payment receipt
per account and offers confirmation again after reload, without creating another
charge.

Older offline records without an account owner require a read-only friendship
ownership check before migration and replay. Records that cannot be attributed
safely remain retained. Preserve browser storage while work is pending.

These fixes prevent recurrence. They do not invent corrections for balances,
payment fragments, missing offline writes, or entitlement flags already damaged
by earlier behavior; historical reconciliation requires trustworthy records.

## Validation

The original bugs were reproduced before fixes. Tests use disposable local
databases and servers; fault injection verifies rollback, and concurrent requests
verify settlement and refresh behavior.

- `npm test`: **50 passed**, zero failures or skipped tests. Includes existing
  API/database/photo/currency checks and new ledger, billing, queue, migration,
  concurrency, and failure-recovery regressions.
- `npm run test:bugs:browser`: **3 passed** in mobile Chromium. Checks a complete
  205-entry JSON export, failed deletion, and payment confirmation after an outage
  and reload with only one purchase order.
- `node --import /workspace/.cloud-onboarding/udhaar/playwright-system.mjs scripts/person-create.mjs`:
  passed the existing person-creation browser flow.
- `node --import /workspace/.cloud-onboarding/udhaar/playwright-system.mjs scripts/moment-flow.mjs`:
  passed the existing private Moment and multiple receipt-photo browser flows.
- `node --check` for all 23 changed/new JavaScript files and `git diff --check`:
  passed.

The onboarding helper in the last two commands selects installed system Chromium.
Outside this cloud environment, use the repository's Playwright browser setup.

The security patch received an independent read-only review. Its confirmed
legacy-payment, confirmation-retry, and refresh/logout race findings were
reproduced, fixed, and included in the regression checks above. Malformed payment
inputs, forged signatures, foreign orders, mismatched provider details,
uncaptured payments, provider failure, and transactional activation failure are
covered alongside successful owner purchases and retries.

Live Razorpay charges and a production Turso deployment were not exercised.
Gateway I/O uses deterministic local fixtures; database checks use actual local
libSQL transactions. No production credentials or production data were used.
