[33mcommit efcc594fc7a7c1565e42f3c9522e18880945fc52[m[33m ([m[1;36mHEAD -> [m[1;32mmain[m[33m, [m[1;31morigin/main[m[33m, [m[1;31morigin/HEAD[m[33m)[m
Author: 吕亮 <lvliang@m1267.hengshi.org>
Date:   Tue Apr 14 17:06:12 2026 +0800

    docs(impl-slices): add TDD implementation slices S0–S24 with full P1 coverage
    
    - Add IMPL-SLICES.md: 25 ordered slices (S0–S24 + S15b) with test-first
      convention, covering all phases from scaffold to E2E validation
    - Update SPEC.md: fix buildIMWorkerCommand signature to accept bridgeScriptPath,
      align ClaudeCodePlugin example with MCP bridge design
    - Update TODO.md: mark P1 items as covered by corresponding slices
    
    P1 coverage across slices:
      S3  — initState lazy init, lifecycleStatus decoupling, revision CAS, attach priority
      S5  — server-push event codec (encodeEvent, event type in decodeMessage)
      S6  — subscribe command, pushEvent broadcast, UID validation
      S8  — CLI entry ACL enforcement, SESSION_BUSY/ACL_DENIED isolation
      S9  — attach initState guard, attach-over-IM priority
      S13 — spawnGeneration dedup for pre-warm vs lazy spawn
      S14 — dedupeKey dedup, replay/confirm/discard matrix, replayOf pointer, audit fields
      S15 — ApprovalContext chain, first-write-wins, scope=session cache, takeover priority
      S15b— IM entry ACL (new slice), role matrix, zero-side-effect ACL_DENIED
      S24 — TUI real-time panel via subscribe + session_state_changed events
    
    Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

[33mcommit 4e2231fac84302a13ca9ae24cbd7fc43f4a24503[m
Author: 吕亮 <lvliang@m1267.hengshi.org>
Date:   Tue Apr 14 14:17:40 2026 +0800

    docs(spec): address P0 review findings — MCP bridge, stream cursor, state lock, approval timeout
    
    - §5: define Stdio↔Socket bridge for MCP permission prompt tool routing
    - §3.10: add StreamCursor type with fallback strategy for ID mismatch (compression, reset)
    - §3.6: add attach_pending state to prevent im_processing/attach race condition
    - §3.8: clarify 429 handling (delegate to CLI native retry), add messageTimeoutSeconds
    - §4.1: add createLiveMessage for throttled streaming output to IM
    - §6: add permissionTimeoutSeconds alignment note against Claude API timeout
    
    Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

[33mcommit 6d5b886937db76b3047f2de3c3cfc53005fe530c[m
Author: 吕亮 <lvliang@m1267.hengshi.org>
Date:   Tue Apr 14 11:56:37 2026 +0800

    docs(spec): fill P1-P3 gaps — exception recovery, queue semantics, types, security model
    
    Completed all unresolved items from P1–P3 checklist:
    
    - §3.8 Agent runtime exception & recovery strategy:
      crash backoff (1s/3s/10s), message timeout (failed→idle),
      429 rate-limit retry (2×: 2s/5s), daemon restart recovery semantics
    
    - §3.9 Queue & takeover strategy:
      attached-period queue (enqueuePolicy=auto_after_detach),
      hard vs soft takeover (graceSeconds=30), restoreAction per message
    
    - §3.10 Core type definitions:
      MessageContent, MessageTarget, IncomingMessage, ApprovalRequest,
      ApprovalResult (with scope once|session), CLIEvent union type
    
    - §6 Security & authorization model extended:
      ACL roles (operator/approver/owner), requestId format, scope semantics,
      capability risk tiers (read_only/file_write/shell_dangerous/network_destructive),
      fail-closed policy, audit log strategy (daemon.log + audit.log)
    
    - §3.2/§3.4/§3.5/§3.7: attachedPid validation, stale approval invalidation,
      `import` command, CLI⇄IPC parameter alignment table
    
    - §9: session lifecycle & cleanup (TTL→stale, archive-not-delete,
      running sessions immune to TTL)
    
    - TODO.md: mark all corresponding items as [x]
    
    Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

[33mcommit 5abd0eefcf2fe6afd4a92b0d3e220b7e7320a764[m
Author: 吕亮 <lvliang@m1267.hengshi.org>
Date:   Tue Apr 14 08:29:21 2026 +0800

    docs(spec): align SPEC and TODO status after spike closure
    
    Sync TODO checkboxes with finalized SPEC decisions for state machine, worker lifecycle, IPC, IM plugin interfaces, and approval routing.
    
    Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

[33mcommit 12e95fab1088e9f89f5caccf97321399bff4d4af[m
Author: 吕亮 <lvliang@m1267.hengshi.org>
Date:   Mon Apr 13 19:36:11 2026 +0800

    harness: adapt Claw One harness framework to mm-coder TypeScript project
    
    - Rewrite AGENTS.md for mm-coder (AI CLI session bridge with IM integration)
    - Replace Rust/Rust-specific specs with TypeScript/Node.js equivalents
    - Replace testing.spec.md patterns (Rust cargo → Vitest)
    - Replace api.spec.md → ipc-plugin.spec.md (HTTP API → Unix socket IPC)
    - Replace release.spec.md (Cargo build → npm scripts)
    - Generalize all guards (no Rust-specific patterns like git2::, hull/src/api/)
    - Add no-direct-sessions-modification.rule (mm-coder uses sessions.json)
    - Update pre-commit.sh (cargo → npm check + vitest)
    - Update validate-arch.sh (hull/src/api → src/index.ts, src/ipc/)
    - Update evaluate-guards.sh for TypeScript patterns
    - Update list.sh and prepare-commit.sh
    - Update harness-evolution.spec.md metadata
    
    Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

[33mcommit 289d5d4fa137abf2de54a7826aff57f538046e57[m
Author: 吕亮 <lvliang@m1267.hengshi.org>
Date:   Mon Apr 13 19:25:51 2026 +0800

    docs: record all P0 Spike conclusions, update SPEC/TODO to development-ready
    
    Spike 1: -p mode session compatibility verified
    Spike 2: PermissionRequest(MCP) selected, PreToolUse dropped
    Spike 3: Claude Code auto-summarizes context, no management needed
    Spike 4: SIGTERM exit 143, session integrity reliable on resume
    Spike 5: stream-json event types mapped (7 types, v2 new ones noted)
    
    Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

[33mcommit 92eed05744daeb7f9ff3a52175cc5bc688e29225[m
Author: 吕亮 <lvliang@m1267.hengshi.org>
Date:   Mon Apr 13 16:37:50 2026 +0800

    docs: apply Spike 1 conclusions — IM worker long-lived process model
    
    Spike 1 verified: --resume sessions are compatible across interactive
    and -p modes; --input-format stream-json keeps the process alive for
    multiple messages; sendToolResult can approve permissions via stdin
    directly without an MCP server.
    
    Architecture decisions recorded:
    - IM side uses a persistent worker process (bridge model) per session
    - Lazy startup: no auto-respawn on daemon restart, first IM message triggers spawn
    - Pre-warm: immediately spawn IM worker after 'mm-coder attach' exits
    - Crash restart: only on non-zero exit, max retries configurable (default 3)
    - CLIPlugin.buildMessageCommand → buildIMWorkerCommand (long-lived process)
    - Session.imProcessingPid → imWorkerPid + imWorkerCrashCount
    
    TODO.md: mark Spike 1 done, add IM worker lifecycle tasks, add import command item.
    
    Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

[33mcommit 1526f6cbc42db221ef16c216c88bfdaf9773bcc9[m
Author: 吕亮 <lvliang@m1267.hengshi.org>
Date:   Sun Apr 12 00:00:00 2026 +0800

    Refine spec for TUI mode and permission routing
    
    Clarify IM thread routing, add daemon-backed TUI mode, and move
    permission handling to CLI-specific native mechanisms. Document why
    Claude Code should use PreToolUse Hook rather than a shared MCP
    permission server for approval interception.
    
    Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

[33mcommit f6d3a08bf1e024dcef37cab49a9c3f4055b7f4a6[m
Author: 吕亮 <lvliang@m1267.hengshi.org>
Date:   Sat Apr 11 22:48:50 2026 +0800

    Add README and TODO from design review
    
    - README.md: project overview, core features, usage flow, architecture summary
    - docs/TODO.md: 25 issues from design review, organized by priority (P0-P3)
    
    Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

[33mcommit 838673773dfd1f08ee36aec114dd96a2de9498a8[m
Author: 吕亮 <lvliang@m1267.hengshi.org>
Date:   Sat Apr 11 22:41:32 2026 +0800

    Add project spec: session-based AI CLI bridge with IM integration
    
    Define requirements and design for mm-coder, a tool that bridges AI CLI
    sessions (Claude Code, etc.) with IM platforms (Mattermost, etc.) for
    remote interaction. Key decisions: session-based hybrid architecture,
    plugin system for extensibility, PreToolUse hook for IM permission approval.
    
    Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

[33mcommit 2b15001c5aaa1afa2a5ab758ddfbaf6ca083fcf7[m
Author: lvliang <meredith620@gmail.com>
Date:   Sat Apr 11 20:59:30 2026 +0800

    Initial commit
