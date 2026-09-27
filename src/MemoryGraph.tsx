import { useState } from "react";
import { ArrowDown, ChevronDown, GitBranch, Sparkles } from "lucide-react";
import type { RunResult, SessionState } from "../shared/types";

const FIELDS = {
  packageMass: "Parcel weight",
  bridgeCapacity: "Bridge limit",
  bridgeColor: "Bridge color",
};
const CHECKS = {
  load: "Load check",
  route: "Route check",
  destination: "Destination check",
};

const HANDLER_LABELS: Record<string, string> = {
  recall_dependencies: "Recall the lesson",
  select_checks: "Pick the checks",
  check_load: "Check load",
  check_route: "Check the path",
  check_destination: "Check the destination",
  choose_route: "Choose route",
  simulate_delivery: "Deliver",
  verify_delivery: "Verify outcome",
};

export function MemoryGraph({
  run,
  session,
  draftChanged,
}: {
  run: RunResult | null;
  session: SessionState | null;
  draftChanged: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!run)
    return (
      <div className="graph-empty">
        <GitBranch size={25} />
        <h3>A lesson leaves a trail.</h3>
        <p>
          Run a delivery to see how a change connects to a check, a piece of
          evidence, and a path.
        </p>
        {session?.rules.some((rule) => rule.source === "gbrain") && (
          <span>
            <Sparkles size={12} />
            This agent has already recalled a saved rule.
          </span>
        )}
      </div>
    );
  const learned = run.memoryUsed.filter((rule) => rule.source === "gbrain");
  const procedure = run.procedureUsed ? run.procedureMemory : undefined;
  const nodes = [
    {
      id: "change",
      tag: "01 · The change",
      title: run.plan.changedFields.length
        ? run.plan.changedFields.map((field) => FIELDS[field]).join(", ")
        : learned.length || run.procedureUsed
          ? "Same settings, new knowledge"
          : session && session.history.length > 1
            ? "Same settings, another try"
            : "The first delivery",
      detail: `${run.world.packageMass} kg parcel · ${run.world.bridgeCapacity} kg bridge · ${run.world.bridgeColor}.`,
      active: true,
    },
    {
      id: "rule",
      tag: learned.length ? "02 · GBrain rule" : "02 · Known dependencies",
      title: learned.length
        ? "A remembered connection"
        : "The rules it started with",
      detail: learned.length
        ? learned.map((rule) => rule.reason).join(" ")
        : run.plan.explanation,
      active: learned.length > 0,
    },
    {
      id: "procedure",
      tag: procedure ? "03 · Memorable procedure" : "03 · Execution trace",
      title:
        procedure?.title ||
        run.plan.selectedChecks.map((id) => CHECKS[id]).join(" → ") ||
        "Reuse the previous checks",
      detail: procedure
        ? run.procedureSteps?.length
          ? run.procedureSteps
              .map(
                (step) =>
                  `${step.seq}. ${HANDLER_LABELS[step.handler] || step.handler}${step.status === "reused" ? " · earlier result" : ""}\n${step.result}`,
              )
              .join("\n")
          : procedure.steps
              .map(
                (step) =>
                  `${step.seq}. ${step.action}${step.description ? ` — ${step.description}` : ""}`,
              )
              .join("\n")
        : run.procedureFallbackReason ||
          "No recalled procedure was used for this run. These are the checks actually selected by the execution engine.",
      active: Boolean(procedure),
    },
    {
      id: "evidence",
      tag: "04 · The evidence",
      title: run.staleEvidence
        ? "An old check missed the change"
        : "Checks matched to their inputs",
      detail: run.checks
        .map(
          (check) =>
            `${CHECKS[check.checkId]}: ${check.status}; ${check.actuallyApplicable ? "applicable" : "stale"} evidence. ${check.receipt.details}`,
        )
        .join("\n"),
      active: !run.staleEvidence,
    },
    {
      id: "route",
      tag: "05 · The consequence",
      title:
        run.outcome === "fell"
          ? "Bridge collapsed"
          : run.route === "detour"
            ? "Detour → delivered"
            : run.outcome === "stopped"
              ? "Stopped before crossing"
              : "Bridge → delivered",
      detail: run.explanation,
      active: run.outcome === "delivered",
    },
  ];
  return (
    <div className="memory-graph">
      <p className="graph-context">
        {draftChanged
          ? "A trace of the previous run."
          : "Follow the decision, from change to consequence."}
      </p>
      {nodes.map((node, index) => (
        <div key={node.id} className="graph-node-wrap">
          {index > 0 && (
            <div className={`graph-edge ${node.active ? "active" : ""}`}>
              <ArrowDown size={11} />
            </div>
          )}
          <button
            className={`graph-node ${node.active ? "active" : ""} ${node.id === "route" && run.outcome === "fell" ? "failed" : ""}`}
            onClick={() => setExpanded(expanded === node.id ? null : node.id)}
            aria-expanded={expanded === node.id}
            title={
              node.id === "procedure" && run.procedureSteps?.length
                ? run.procedureSteps
                    .map(
                      (step) => `${step.seq}. ${step.action} → ${step.handler}`,
                    )
                    .join("\n")
                : undefined
            }
          >
            <span className="graph-tag">
              {node.tag}
              <ChevronDown size={11} />
            </span>
            <strong>{node.title}</strong>
            {expanded === node.id && (
              <span className="graph-detail">{node.detail}</span>
            )}
          </button>
        </div>
      ))}
      {procedure && (
        <div className="procedure-receipt">
          <span>Procedure</span>
          <code>{procedure.slug}</code>
        </div>
      )}
    </div>
  );
}
