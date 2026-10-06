# Feature Specification: Kubernetes Minecraft Server Management

**Feature Branch**: `003-kubectl-deployment-management`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "We want to have an interface, using kubectl, to manage minecraft deployments on our cluster, including the gameserver management within the pod. These minecraft servers run in a shared namespace. Kubeconfig can be provided if needed."

## Clarifications

### Session 2026-10-06

- Q: Should the manager replace the existing infrastructure-as-code repo (OneDev manifests and deploy job) as the owner of server definitions, creation, deletion and deploys? → A: Yes, replace it fully. The five existing servers (`gaitie`, `daan`, `kontgat`, `creative`, `plaskutje`) MUST be adopted without disruption and MUST NOT be deletable.
- Q: Where should the manager keep each server's definition (settings and port): in the cluster itself or in its own separate store? → A: In the cluster. The server's own cluster objects hold the settings, port and protected marker; the manager keeps no separate store.
- Q: When a server is deleted, where should the exported copy of its world go? → A: A separate exports volume in the cluster, kept until an operator removes it, with a download in the manager.
- Q: Should every signed-in operator be able to create and delete servers, or only some of them? → A: Every signed-in operator, with no roles; only protection restricts deletion.
- Consequence (analysis 2026-10-06): the world export on delete is mandatory, not optional, because constitution principle III requires world data to be backed up before destructive changes. A forced kill is not offered in this version.
- Consequence: because the manager now owns each server's settings, editing settings through the manager is in scope (they are applied by restarting the server), and no other system may re-apply definitions to the same servers once adopted.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See all Minecraft servers and their state (Priority: P1)

An operator opens the manager and sees every Minecraft Bedrock server in the shared namespace, with
its name, world, game mode, public port, running state (running, starting, stopping, stopped, failing), and
age. Nothing else is usable until the manager can reliably see the cluster.

**Why this priority**: Read-only visibility is the smallest slice that delivers value and proves
cluster connectivity and credentials work end to end.

**Independent Test**: Point the manager at the cluster; the list shows the five existing servers
with correct state and ignores unrelated workloads.

**Acceptance Scenarios**:

1. **Given** five servers exist in the shared namespace, **When** the operator opens the list, **Then** all five appear with correct name, world, mode, port, and state.
2. **Given** a pod crashes or is restarting, **When** the operator views the list, **Then** that server shows a failing/restarting state within seconds.
3. **Given** other non-Minecraft workloads exist in the namespace, **When** the list is shown, **Then** they are not listed or manageable.
4. **Given** the cluster is unreachable or credentials are invalid, **When** the operator opens the list, **Then** a clear error explains the cause instead of an empty list.

---

### User Story 2 - Adopt and protect the existing servers (Priority: P2)

The five running servers are brought under the manager's control without restarting them or
touching their worlds, and are marked protected so they can never be deleted through the manager.

**Why this priority**: The manager replaces the old repo, so it must take ownership safely before
anything is changed. The existing worlds are irreplaceable.

**Independent Test**: Adopt all five servers while players are connected; no server restarts, no
volume or world data changes, and each shows as protected with its current settings.

**Acceptance Scenarios**:

1. **Given** the five running servers, **When** the operator adopts them, **Then** each keeps running without a restart and its world data and public port are unchanged.
2. **Given** an adopted server, **When** the operator views its definition, **Then** the settings match what the server is actually running.
3. **Given** any of the five protected servers, **When** anyone attempts to delete it by any means the manager offers, **Then** the attempt is refused with an explanation.
4. **Given** adoption would change a running server in any way (restart, new volume, new port), **When** the operator reviews it, **Then** the difference is shown first and nothing is applied without explicit confirmation.

---

### User Story 3 - Control server lifecycle (Priority: P3)

An operator can start, stop, and restart a server, and view its logs, without using the cluster
command line.

**Why this priority**: The most common day-to-day operations after visibility and adoption.

**Independent Test**: Stop a running server, confirm players are disconnected cleanly and the world
is intact; start it again and confirm it returns to running.

**Acceptance Scenarios**:

1. **Given** a running server, **When** the operator stops it, **Then** it shuts down gracefully before the pod is removed.
2. **Given** a stopped server, **When** the operator starts it, **Then** the state moves to starting and then running once the server accepts connections.
3. **Given** a running server, **When** the operator restarts it, **Then** it stops gracefully and returns, with progress visible throughout.
4. **Given** a stop or restart, **When** the operator triggers it, **Then** explicit confirmation is required first.
5. **Given** a server pod, **When** the operator opens its logs, **Then** recent output is shown and new lines stream in live.

---

### User Story 4 - Manage the game server inside the pod (Priority: P4)

An operator runs console commands on a running server (e.g. list players, op a player, manage the
allow-list) and sees the response, and sees who is online.

**Why this priority**: This is the in-pod management the request calls out; it builds on visibility
and lifecycle control.

**Independent Test**: Against a running server, send a command and see its output; list players and
see the current ones.

**Acceptance Scenarios**:

1. **Given** a running server, **When** the operator sends a console command, **Then** the command's response is shown.
2. **Given** a running server, **When** the operator views players, **Then** the current online players are listed.
3. **Given** a server that is not running or not yet ready, **When** the operator tries a command, **Then** it is refused with a clear explanation.

---

### User Story 5 - View and change server settings (Priority: P5)

An operator views and edits a server's settings (server name, world name, game mode, difficulty,
maximum players, allow-list, operators, etc.) through the manager. Changes persist and are applied
by restarting the server.

**Why this priority**: The manager is now the source of truth for settings, so this replaces
editing manifests by hand.

**Independent Test**: Change the maximum players on a server, confirm a restart is offered, and
after the restart the new value is in effect and still there after a second restart.

**Acceptance Scenarios**:

1. **Given** a server, **When** the operator changes a setting and saves, **Then** the operator is asked to confirm that the server will restart, and after confirming the new value is stored and takes effect through that restart.
2. **Given** a saved change, **When** the server restarts for any reason, **Then** the saved value is in effect (not reverted).
3. **Given** an invalid value (wrong type, out of range, world name that doesn't match an existing world), **When** the operator saves, **Then** it is rejected with a clear message and nothing changes.

---

### User Story 6 - Create a new server (Priority: P6)

An operator creates a new Bedrock server (name, world name, game mode, settings) and the manager
sets up everything on the cluster it needs, including a unique public port, and reports what still
has to be done outside the cluster.

**Why this priority**: Replaces the manual create procedure, but is done rarely and must never
endanger the existing servers.

**Independent Test**: Create a server, see it reach running and answer on its new port, with the
existing five untouched throughout.

**Acceptance Scenarios**:

1. **Given** valid inputs, **When** the operator creates a server, **Then** it gets its own storage and a free public port and reaches running.
2. **Given** a name or port already in use, **When** the operator creates a server, **Then** creation is rejected with a clear message and nothing changes.
3. **Given** creation requires a change to shared network entry points, **When** the manager applies it, **Then** the change is validated first and all existing servers' ports keep working.
4. **Given** the new port must also be opened in the firewall, **When** creation completes, **Then** the manager tells the operator which port to open and can check whether the server answers from outside.

---

### User Story 7 - Delete a non-protected server (Priority: P7)

An operator deletes a server they created, after an explicit confirmation. The server's world is
always exported first. Protected servers cannot be deleted.

**Why this priority**: Completes the lifecycle but is the most dangerous operation.

**Independent Test**: Delete a test server; it and its resources are gone and its world was
always exported first. Attempting the same on a protected server is refused.

**Acceptance Scenarios**:

1. **Given** a non-protected server, **When** the operator deletes it, **Then** they must type the server's name to confirm and be warned the world is deleted with it.
2. **Given** any non-protected server, **When** deletion proceeds, **Then** the world is exported to the exports volume before anything is removed, and deletion is aborted if the export fails.
3. **Given** a server that has not been adopted, **When** deletion is attempted, **Then** it is refused with a message to adopt it first.
4. **Given** a protected server, **When** deletion is attempted, **Then** it is refused and nothing changes.
5. **Given** a successful delete, **When** the operator views the list, **Then** the server and its public port are gone and the port is free for reuse.

---

### Edge Cases

- Cluster unreachable, credentials expired, or insufficient permissions: show actionable errors; never show stale state as live.
- Pod is running but the game server is not yet accepting commands: in-pod actions are refused with a "not ready" message.
- Pod restarts or is rescheduled mid-action: the operator sees the action as failed or unknown, not silently successful.
- Two operators act on the same server at the same time: the later action sees current state and is rejected or applied safely.
- A server is changed outside the manager (by hand on the cluster, or by the old repo's deploy job still running): the manager shows the actual state and settings; it never overwrites them from a remembered copy, because it keeps none.
- Graceful stop times out: the operator sees a clear failure with the server's logs and the server keeps showing as stopping; no forced kill is offered.
- Operator-supplied names, commands, and settings contain special characters: they are validated and never interpreted as anything but data.
- A workload in the namespace is not a Minecraft server: it is never listed or modifiable.
- Starting or restarting a server pulls the newest server version by default, which can upgrade a world irreversibly: the operator is warned beforehand and can pin a version in the settings.
- Restart and settings changes take the server offline (one pod at a time on one volume), typically under 60 seconds plus the game server's own startup time, and players are disconnected.
- Creating a server would change shared entry-point configuration and that change fails validation: nothing is applied and existing servers keep working.
- The manager restarts or is reinstalled: nothing is lost, because every server's definition and protected marker live in the cluster.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST discover and list all Minecraft servers in the configured shared namespace, showing name, world, game mode, public port, state, and age.
- **FR-002**: System MUST restrict all operations to the shared namespace and to workloads identified as Minecraft servers, plus the specific shared entry-point configuration needed for server ports.
- **FR-003**: System MUST reflect the cluster's actual state, picking up changes made outside the manager, and surface changes without manual page reloads.
- **FR-004**: Operators MUST be able to start, stop, and restart a server.
- **FR-005**: Stop and restart MUST use a graceful shutdown. A forced kill is not offered through the manager in this version; if a graceful stop times out, the operator is shown the failure and the server's logs.
- **FR-006**: Operators MUST be able to view recent logs of a server and follow new output live.
- **FR-007**: Operators MUST be able to send console commands to a running server and see the response.
- **FR-008**: Operators MUST be able to see the current online players of a running server.
- **FR-009**: Operators MUST be able to view and edit a server's settings, including allow-list and operators; saving settings MUST require confirmation that the server restarts, and saved settings MUST persist across restarts.
- **FR-010**: System MUST treat the cluster objects of each server as that server's definition (settings, public port, protected marker) and MUST NOT keep a separate copy; a change made to those objects by any means is therefore the server's new definition and is shown as such.
- **FR-011**: System MUST adopt the five existing servers (`gaitie`, `daan`, `kontgat`, `creative`, `plaskutje`) without restarting them, changing their storage, worlds, or public ports; any difference MUST be shown and confirmed before it is applied.
- **FR-012**: System MUST mark the five existing servers as protected (a marker on the server's cluster objects) and MUST refuse every delete or world-replacing operation on them, with no override available in the manager; the five known names MUST stay protected even if the marker is missing.
- **FR-013**: Operators MUST be able to create a new server from basic inputs (name, world name, game mode, settings); the system MUST allocate or validate a unique name and public port and reject duplicates.
- **FR-014**: When creating or removing a server requires a change to shared entry-point configuration, System MUST validate the full resulting configuration before applying it and MUST preserve all other servers' entries. The operator MUST be told, before confirming, that the change restarts the cluster's ingress and briefly interrupts all web traffic through it, not only Minecraft.
- **FR-015**: After creating a server, System MUST tell the operator which port must be opened in the firewall and offer a check of whether the server answers from outside.
- **FR-016**: Operators MUST be able to delete a non-protected server only after typing its name to confirm, with an explicit warning that its world is deleted; the system MUST always export the world first; the export MUST be stored on a separate exports volume that survives the server's deletion and MUST be downloadable through the manager; deletion MUST abort if the export fails; deletion of a server that has not been adopted MUST be refused with a message to adopt it first.
- **FR-017**: System MUST authenticate every request and permit only authenticated operators to act, reusing the existing web authentication; there are no roles, so every authenticated operator may create and delete non-protected servers.
- **FR-018**: System MUST validate all operator input (names, ports, commands, settings values) and MUST keep file access inside the server's data directory.
- **FR-019**: Cluster credentials and any game server secrets MUST NOT be exposed to the browser, logged, or returned in responses.
- **FR-020**: System MUST emit structured logs of each management action (who, which server, what, outcome) and surface failures with actionable messages.
- **FR-021**: System MUST report in-progress or failed actions accurately after a manager restart, without relying on in-memory state.
- **FR-022**: System MUST support being given a cluster access configuration (kubeconfig) explicitly, and fall back to the environment's default cluster access when none is provided.
- **FR-023**: Before a start, restart, or settings save on a server whose version is not pinned, System MUST warn the operator that the latest version may be pulled and may irreversibly upgrade the world, and MUST let the operator pin a version in settings.

### Key Entities

- **Minecraft Server**: A managed Bedrock server. Attributes: name, world name, game mode, settings, public port, desired and observed state, protected flag, age.
- **Server Definition**: A server's settings, public port and protected marker, held in its cluster objects; this is what replaces the manifests repo.
- **Server Instance (Pod)**: The running instance of a server. Attributes: health, restart count, readiness of the game server inside.
- **Public Port Entry**: A server's public network entry point in shared configuration; unique per server.
- **Console Session**: Live output plus the ability to send commands to a running server.
- **World Export**: A copy of a server's world taken before every deletion, kept on the exports volume until an operator removes it, and downloadable through the manager.
- **Cluster Connection**: Credentials and target (cluster, shared namespace) held only server-side.
- **Management Action**: A recorded operator action (start, stop, restart, command, edit, adopt, create, delete) with actor, target, time, and outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator sees the full, accurate list of servers within 5 seconds of opening the interface.
- **SC-002**: A change to a server's state on the cluster appears in the interface within 10 seconds.
- **SC-003**: Adopting the five existing servers causes zero restarts, zero player disconnects, and zero changes to world data or ports (verified before and after).
- **SC-004**: 0 delete or world-replace operations on the five protected servers succeed through any path the manager offers (verified by negative tests).
- **SC-005**: An operator can stop, start, or restart a server in under 1 minute of hands-on time without the cluster command line.
- **SC-006**: A console command's response appears within 3 seconds for a server in the running state.
- **SC-007**: A saved setting is still in effect after two consecutive restarts in 100% of verification runs.
- **SC-008**: An operator can create a new server and have it running in under 5 minutes of hands-on time plus the game server's own startup time, with all existing servers unaffected.
- **SC-009**: No operation can affect a workload outside the shared namespace or one that is not a Minecraft server (verified by negative tests).
- **SC-010**: Cluster credentials never appear in any browser-visible response or log output.

## Assumptions

- The manager replaces the self-hosted OneDev manifests repo and its deploy job as owner of server definitions and deploys. Retiring that repo and job is an operator step done after adoption; until then, the job MUST NOT be allowed to re-apply definitions to adopted servers.
- Servers are Minecraft Bedrock Edition servers, each with its own public UDP port; ports cannot be shared between servers. The server version is part of its settings (default: latest).
- Operators are authenticated via the existing web front-end authentication (feature 002); no new role model, so every authenticated operator can perform all actions except those blocked by protection.
- All servers live in one shared namespace, configured once; multi-namespace and multi-cluster are out of scope.
- Servers are identifiable by a consistent marker on their workloads; the manager adds its own markers (managed, protected) to adopted servers' objects, which is the only change adoption makes.
- Each server's world and data live on persistent storage that survives pod restarts.
- The manager has cluster access (supplied kubeconfig or default) with the rights needed in the shared namespace and for the shared entry-point configuration.
- Opening the public port in firewalls (node and hosting provider) is outside the cluster and stays a manual operator step.
- Cluster interaction uses kubectl as the stated mechanism, entirely in the server-side layer, in line with the project constitution.
- World exports are kept on their volume until removed by hand with the cluster command line; automatic cleanup and a removal action are out of scope.
- Importing worlds from old backups (including migration from the earlier standalone setup), replacing an existing server's world, scheduled backups, monitoring dashboards, and add-on management are out of scope for this feature.
