import { useState } from "react";
import {
  Check,
  CheckCheck,
  ChevronDown,
  Circle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type {
  BridgeColor,
  Integrations,
  RunResult,
  SessionState,
  World,
} from "../shared/types";

const COLORS: BridgeColor[] = ["coral", "teal", "gold"];
const LABELS = {
  load: "Check the load",
  route: "Choose a safe route",
  destination: "Confirm the destination",
};

export function Inspector({
  world,
  onWorldChange,
  session,
  run,
  integrations,
  disabled,
  onMapToggle,
}: {
  world: World;
  onWorldChange: (world: World) => void;
  session: SessionState | null;
  run: RunResult | null;
  integrations: Integrations | null;
  disabled: boolean;
  onMapToggle: (open: boolean) => void;
}) {
  const [openCheck, setOpenCheck] = useState<string | null>(null);
  const [tab, setTab] = useState<"checks" | "graph">("checks");
  const draftChanged = Boolean(
    run &&
      (run.world.packageMass !== world.packageMass ||
        run.world.bridgeCapacity !== world.bridgeCapacity ||
        run.world.bridgeColor !== world.bridgeColor),
  );
  const learnedRules =
    session?.rules.filter((rule) => rule.source === "gbrain") ?? [];
  return (
    <aside className="inspector" aria-label="World controls and agent memory">
      <section className="world-controls">
        <h2>
          Make it interesting<span className="heading-spark">✳</span>
        </h2>
        <p className="section-intro">Change the world. See what changes.</p>
        <label className="slider-field" htmlFor="parcel-weight">
          <span className="slider-heading">
            <span>Parcel weight</span>
            <strong>
              {world.packageMass}
              <span> kg</span>
            </strong>
          </span>
          <input
            id="parcel-weight"
            type="range"
            min="1"
            max="12"
            step="1"
            value={world.packageMass}
            disabled={disabled}
            style={
              {
                "--range-progress": `${((world.packageMass - 1) / 11) * 100}%`,
              } as React.CSSProperties
            }
            onChange={(event) =>
              onWorldChange({
                ...world,
                packageMass: Number(event.target.value),
              })
            }
          />
          <span className="slider-endpoints">
            <span>1 kg · light as a feather</span>
            <span>12 kg</span>
          </span>
        </label>
        <label className="slider-field" htmlFor="bridge-capacity">
          <span className="slider-heading">
            <span>Bridge limit</span>
            <strong>
              {world.bridgeCapacity}
              <span> kg</span>
            </strong>
          </span>
          <input
            id="bridge-capacity"
            type="range"
            min="1"
            max="12"
            step="1"
            value={world.bridgeCapacity}
            disabled={disabled}
            style={
              {
                "--range-progress": `${((world.bridgeCapacity - 1) / 11) * 100}%`,
              } as React.CSSProperties
            }
            onChange={(event) =>
              onWorldChange({
                ...world,
                bridgeCapacity: Number(event.target.value),
              })
            }
          />
          <span className="slider-endpoints">
            <span>1 kg</span>
            <span>12 kg · sturdy stuff</span>
          </span>
        </label>
        <fieldset className="color-field" disabled={disabled}>
          <legend>
            Bridge color <span>Just a fresh coat.</span>
          </legend>
          <div className="color-swatches">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                disabled={disabled}
                className={`color-swatch ${color} ${world.bridgeColor === color ? "selected" : ""}`}
                aria-label={`${color} bridge`}
                aria-pressed={world.bridgeColor === color}
                onClick={() => onWorldChange({ ...world, bridgeColor: color })}
              >
                {world.bridgeColor === color && (
                  <Check size={16} strokeWidth={2.5} />
                )}
              </button>
            ))}
            <span className="selected-color">{world.bridgeColor}</span>
          </div>
        </fieldset>
      </section>
      <section className="memory-section">
        <div className="section-heading">
          <h2>What it knows</h2>
          <Sparkles size={17} />
        </div>
        <div
          className="inspector-tabs"
          role="tablist"
          aria-label="Agent insight"
        >
          <button
            role="tab"
            aria-selected={tab === "checks"}
            onClick={() => {
              setTab("checks");
              onMapToggle(false);
            }}
          >
            Checks & lesson
          </button>
          <button
            role="tab"
            aria-selected={tab === "graph"}
            onClick={() => {
              setTab("graph");
              onMapToggle(true);
            }}
          >
            Memory map
          </button>
        </div>
        {tab === "graph" ? (
          <div className="map-sidebar-note">
            <Sparkles size={23} />
            <h3>Follow the little connections.</h3>
            <p>
              The decision map is open below the world. Every step comes from
              this agent’s actual run.
            </p>
            <span>
              {run?.procedureUsed
                ? "Memorable guided this run."
                : "Execution trace · no recalled procedure used."}
            </span>
          </div>
        ) : (
          <>
            {learnedRules.length > 0 ? (
              <div className="learned-memory">
                <span className="memory-caption">
                  <span className="memory-pulse" />A lesson it can carry forward
                </span>
                <p>{learnedRules[learnedRules.length - 1].reason}</p>
                <span className="memory-source">
                  <CheckCheck size={13} />
                  Retrieved from saved memory
                </span>
              </div>
            ) : (
              <p className="empty-memory">
                Experience starts with a first try.
                <br />
                <span>Let’s give it something to remember.</span>
              </p>
            )}
            {run && (
              <div className="checks-heading">
                {draftChanged
                  ? "Previous run · inputs changed"
                  : "Inside this run"}{" "}
                <span>
                  {run.checks.filter((check) => check.status === "ran").length}{" "}
                  checked ·{" "}
                  {
                    run.checks.filter((check) => check.status === "reused")
                      .length
                  }{" "}
                  reused
                </span>
              </div>
            )}
            {run?.independentVerification?.passed && (
              <div className="independent-proof">
                <CheckCheck size={11} />
                Cross-checked with {run.independentVerification.steps} CLI steps
              </div>
            )}
            <div className="check-list">
              {(["load", "route", "destination"] as const).map((id) => {
                const result = run?.checks.find(
                  (check) => check.checkId === id,
                );
                const open = openCheck === id;
                return (
                  <div
                    className={`check-item ${result ? (draftChanged ? "previous" : result.actuallyApplicable && result.receipt.inputHash === result.currentInputHash && result.receipt.passed ? "passed" : "needs-attention") : "pending"}`}
                    key={id}
                  >
                    <button
                      className="check-button"
                      disabled={!result}
                      onClick={() => setOpenCheck(open ? null : id)}
                      aria-expanded={open}
                    >
                      <span className="check-symbol">
                        {!result ? (
                          <Circle size={18} />
                        ) : result.status === "reused" ? (
                          <RotateCcw size={15} />
                        ) : (
                          <Check size={17} />
                        )}
                      </span>
                      <span>{LABELS[id]}</span>
                      {result && (
                        <span className={`check-status ${result.status}`}>
                          {draftChanged
                            ? "Previous"
                            : !result.actuallyApplicable
                              ? "Stale"
                              : result.status === "ran"
                                ? "Checked"
                                : "Reused"}
                        </span>
                      )}
                      {result && (
                        <ChevronDown
                          size={13}
                          className={open ? "is-open" : ""}
                        />
                      )}
                    </button>
                    {open && result && (
                      <div className="check-details">
                        <p>{result.receipt.details}</p>
                        <span>
                          Evidence from a {result.receipt.world.packageMass} kg
                          parcel · {result.receipt.world.bridgeCapacity} kg
                          limit
                        </span>
                        <span>
                          {draftChanged
                            ? "Draft inputs have changed; run again to check them."
                            : result.actuallyApplicable &&
                                result.receipt.inputHash ===
                                  result.currentInputHash
                              ? "Evidence applies to this run."
                              : "Evidence does not match the current run inputs."}
                        </span>
                        <code>{result.receipt.id.slice(0, 18)}</code>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {run?.staleEvidence && (
              <div className="stale-note">
                The parcel changed. The load check didn’t.
              </div>
            )}
          </>
        )}
      </section>
      <div className="connection-note" role="status" aria-live="polite">
        {integrations ? (
          <>
            <span
              className="provider-status"
              title={integrations.gbrain.message}
            >
              <span
                className={`connection-dot ${integrations.gbrain.connected ? "connected" : "unavailable"}`}
              />
              GBrain{" "}
              {integrations.gbrain.connected ? "connected" : "unavailable"}
            </span>
            <span
              className="provider-status"
              title={integrations.memorable.message}
            >
              <span
                className={`connection-dot ${integrations.memorable.connected ? "connected" : "unavailable"}`}
              />
              Memorable{" "}
              {integrations.memorable.connected ? "connected" : "unavailable"}
            </span>
          </>
        ) : (
          <span className="provider-status">
            <span className="connection-dot pending" />
            Connecting memory…
          </span>
        )}
      </div>
    </aside>
  );
}
