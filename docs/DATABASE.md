# Proposed database design

Planning only: no SQL, Dexie schema, migration or cloud resource is created in this phase. Constraints below are implementation targets and must be tested before enabling synchronization.

## Shared conventions

- Generate stable UUIDs for decks, words and mutations. Cloud `user_id` references Supabase-managed `auth.users(id)`; no password or custom session tables.
- Cloud timestamps use Postgres `timestamptz` (UTC); local timestamps use ISO 8601 UTC strings. Server revisions are positive `bigint`, serialized as decimal strings at the JS boundary to avoid precision loss.
- Cloud mutable entities have `created_at`, `updated_at`, nullable `deleted_at`, and `revision` starting at 1. The server controls cloud timestamps/revisions and ownership is immutable.
- Validate field limits from [PRD.md](PRD.md) in forms/imports and with server constraints. Normalize duplicate keys using one specified algorithm: Unicode NFC, trimming and case folding. Verify client/server test vectors agree before shipping.

## Supabase Postgres

### decks

- `id uuid primary key`.
- `user_id uuid not null references auth.users(id)`; account deletion behavior must be explicitly designed in a later account-deletion feature, not automatic destructive SQL here.
- `name text not null` (trimmed length 1–100), `description text not null default ''` (up to 2,000 characters).
- Common timestamps, tombstone and revision fields above.
- `unique(user_id, id)` supports composite child references; index `(user_id, deleted_at, id)` for active scoped reads. Deck names need not be unique.

### words

- `id uuid primary key`, `user_id uuid not null references auth.users(id)`, `deck_id uuid not null`.
- `term text not null`, `meaning text not null`, `pronunciation text not null default ''`, `part_of_speech text not null default ''`, `example text not null default ''`, `notes text not null default ''` with PRD length checks.
- `normalized_term text not null`, `normalized_meaning text not null`: derive/validate through a trusted server routine; never trust caller-supplied duplicate keys.
- Common timestamps, tombstone and revision fields. Composite FK `(user_id, deck_id)` → `decks(user_id, id)` blocks cross-user links. Restrict hard parent deletion while children exist; deck deletion is a transaction that tombstones its active children.
- Index `(user_id, deck_id, deleted_at, id)`. An active-row unique index enforces `(user_id, deck_id, normalized_term, normalized_meaning)` where `deleted_at is null`. A restore must recheck uniqueness and parent status.

### sync_operations (introduced with sync)

- `user_id uuid not null references auth.users(id)`, `operation_id uuid not null`, primary key `(user_id, operation_id)`.
- `entity_type text not null` constrained to deck/word, `entity_id uuid not null`, `base_revision bigint` nullable only for creates, `request_hash text not null`, `result jsonb not null`, `created_at timestamptz not null`.
- Record a mutation and its acknowledgement in the same transaction as the entity write. Reusing an operation ID with a different payload is rejected. Store only the necessary acknowledged result, not tokens or credentials.
- No polymorphic FK is claimed for `entity_id`; the RPC validates entity type, ownership and existence. Tombstones preserve entity identity for retry.
- Clients may read only their own acknowledgements if needed; no direct INSERT/UPDATE/DELETE grants. Only the controlled mutation RPC writes this table.

Learning sessions and scores are session-local in the initial proposal. Persistent progress tables are deferred until requirements justify them; no unused profiles table is needed for authentication.

## RLS, grants and write protocol

- Enable RLS on every exposed table. Deny anonymous access to private data; grant the authenticated role only required operations.
- Owner reads require `user_id = (select auth.uid())`. INSERT checks owner, UPDATE checks old and new owner, DELETE checks owner wherever direct writes are intentionally permitted. Validate parent ownership and active status as well as the composite FK.
- For synchronized entities, prefer no direct table mutation grants: reads use owner RLS; creates/updates/tombstones use a transactional RPC with expected revision. Read-only policies alone do not authorize direct mutation.
- If the RPC requires `SECURITY DEFINER`, explicitly verify `auth.uid()` and ownership for every resource, qualify objects, fix `search_path`, and revoke public/anonymous execute rights. Derive the owner from the session rather than a request parameter. RLS alone is not sufficient inside privileged functions.
- The RPC must reject writes under a tombstoned parent, modification of server fields, revision mismatch, invalid duplicate keys and ownership transfer. Lock/update conditionally so two writes to one base revision cannot both succeed. A create uses an absent base revision and must not overwrite an existing ID.
- A consistent paginated snapshot RPC must bind pagination to the same owner and database snapshot; define expiry/restart behavior when implementing it. A simple timestamp cursor is not a claim of reliable synchronization.
- Never use service-role credentials in the browser. Future FastAPI normal user queries should preserve the user's authorization context. Use parameterized queries and allowlisted sort/identifier values.

## IndexedDB with Dexie (future)

Use a versioned database with these logical stores; this is not executable Dexie configuration:

- `decks`: compound primary key `[scope+id]`; indexes `scope` and `[scope+deletedAt]`. Same domain fields as cloud, with `serverRevision` nullable for unsynced creates.
- `words`: compound primary key `[scope+id]`; indexes `[scope+deckId]` and `[scope+deckId+normalizedTerm]`. Same domain fields and normalization rules. Enforce duplicate rules in a transaction; IndexedDB does not provide relational foreign keys or the planned partial unique index.
- `outbox`: primary key `operationId`; indexes `scope`, `[scope+entityType+entityId]`. Contains entity identity, operation kind, base revision, validated payload, attempt count, next retry time and status. Written atomically with each account mutation. Guest changes need no cloud outbox.
- `syncState`: primary key `scope`; tracks last completed sync and pending conflict records/references. Conflicts preserve local and remote snapshots. An incomplete pull never replaces the last committed snapshot.
- `guestCopies`: compound key `[accountId+entityType+guestId]`, with destination entity ID. Record mappings and destination/outbox writes in one transaction; copy decks before their children and reuse mappings on retries.

Scopes are `guest` or `user:<Supabase user UUID>`; do not store a guest as a fake cloud user. Every query is scoped. Sign-out hides account data immediately, pauses its queue and rejects stale in-flight results. Keep pending account data isolated for its next sign-in; do not silently expose it as guest data. Browser storage is not encrypted account isolation on a shared device; device-data removal needs a separate explicit user flow.

## Migration and verification requirements

- Version all Postgres and Dexie migrations; test upgrades with existing records and preserve user data. No destructive operation without explicit authorization. Test cloud changes on an isolated project before production.
- Check NOT NULL/length/duplicate constraints, same-owner parent links, tombstoned parents, restore conflicts and transaction rollback.
- With ordinary user tokens for A/B and an unauthenticated client, verify owner CRUD through the intended API and denial of cross-user reads/writes, forged ownership and cross-user parent IDs. Confirm the actual records after denied mutations, not only response status. Test permitted operations too.
- Test retries after lost acknowledgements, concurrent revisions, delete-versus-edit conflicts, guest-copy retries and account switching. Use neither admin nor service-role credentials to claim RLS isolation.
- Retain tombstones and operation acknowledgements initially. Define a safe offline-client retention/compaction protocol before purging them.
