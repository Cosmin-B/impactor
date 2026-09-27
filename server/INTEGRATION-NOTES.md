# Integration verification

GBrain: a synthetic `impactor-integration-probe-*` namespace passed remember → recall with the logical rule ID and provider fact ID preserved. Reset expired that exact synthetic fact; subsequent recall returned no rules. The application accepts only its schema, namespace, provenance marker, and validated rule fields. Authentication stays server-side.

Memorable: CLI 0.5.30 authenticated successfully after normal browser approval and explicit recording consent. A real engine run with mass 8 kg and capacity 6 kg selected the detour and delivered. Four `scripts/sim-step.mjs` commands executed against `.data/integration-probe`, and the final verifier exited 0. Memorable admitted, stored, and recalled the resulting trace.

Actual recalled procedure:

```json
{
  "slug": "procedures/8c4e6206-recheck-simulated-delivery-route-after-package-mass-changes",
  "source": "memorable",
  "steps": [
    {"seq": 1, "action": "shell", "description": "node scripts/sim-step.mjs check-load --dir .data/integration-probe"},
    {"seq": 2, "action": "shell", "description": "node scripts/sim-step.mjs choose-route --dir .data/integration-probe"},
    {"seq": 3, "action": "shell", "description": "node scripts/sim-step.mjs simulate-delivery --dir .data/integration-probe"},
    {"seq": 4, "action": "shell", "description": "node scripts/sim-step.mjs verify-run --dir .data/integration-probe"}
  ],
  "postconditions": ["node scripts/sim-step.mjs verify-run --dir .data/integration-probe"]
}
```

Admission requires the complete observed workflow. Custom function names alone were rejected with `no_postcondition`; recording only the four shell commands was rejected with `single_verb`. The server now records its actual dependency recall and check selection before the four executed commands. This shape was admitted and stored on a fresh probe, and `show` returned the four real verification commands. Rejections report only recognized reason codes; raw CLI diagnostics are not exposed.

A later admitted recording received another slug. Task recall still preferred an earlier app-owned procedure with the same four verification steps. Storage and exact-slug recall are reported separately: a saved procedure is not falsely reported as the preferred recalled revision. Procedure display preserves returned actions. The engine must map only approved actions to local handlers, never execute a recalled command string.

Memorable reset semantics: the procedure library remains available. Reset clears the demo's GBrain dependency lesson; replay is enabled only when the learned dependency selects the load check. Only app-recorded procedure slugs may be displayed or recalled by this integration.
