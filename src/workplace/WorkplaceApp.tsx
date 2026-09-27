import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  GitBranch,
  Play,
  Save,
  Users,
  RefreshCw,
} from "lucide-react";
import {
  DEFAULT_WORK,
  MISSIONS,
  TEAMS,
  scheduleWork,
  scalingWork,
  type WorkSettings,
  type WorkMemory,
  type Mission,
} from "../../shared/workplace/engine";
import {
  workCase,
  ROLE_NAMES,
  ACTION_NAMES,
  type WorkRole,
} from "../../shared/workplace/cases";
import { OfficeScene } from "./OfficeScene";
import "../ops/ops.css";
import "./workplace.css";
const money = (n: number) => `$${n.toFixed(3)}`;
async function api(action: string, body: unknown) {
  const r = await fetch(`/api/work/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "The request could not complete.");
  return d;
}
export default function WorkplaceApp() {
  const [s, setS] = useState<WorkSettings>({ ...DEFAULT_WORK }),
    [memory, setMemory] = useState<WorkMemory | undefined>(),
    [playing, setPlaying] = useState(false),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState(""),
    [role, setRole] = useState<WorkRole>("engineering"),
    [issue, setIssue] = useState("none"),
    [answer, setAnswer] = useState<any>(null);
  const [id] = useState(() => {
    let x = localStorage.getItem("impactor-workplace-id");
    if (!x) {
      x = crypto.randomUUID();
      localStorage.setItem("impactor-workplace-id", x);
    }
    return x;
  });
  useEffect(() => {
    api("recall", { id })
      .then((d) => {
        if (d.memory) {
          setMemory(d.memory);
          setNotice("Previous task conditions recalled from GBrain.");
        }
      })
      .catch((e) => setNotice(e.message));
  }, [id]);
  const result = useMemo(() => scheduleWork(s, memory), [s, memory]),
    baseline = useMemo(
      () => scheduleWork({ ...s, useMemory: false }, undefined, "baseline"),
      [s],
    ),
    scaling = useMemo(() => scalingWork(s, memory), [s, memory]),
    current = selected
      ? result.tasks.find((t) => t.id === selected)
      : undefined;
  const finished = useCallback(() => setPlaying(false), []);
  const change = (k: keyof WorkSettings, v: unknown) => {
    setAnswer(null);
    setS((w) => ({ ...w, [k]: v }));
  };
  async function remember() {
    setBusy("Saving task conditions to GBrain");
    try {
      const d = await api("remember", { id, settings: s });
      if (!d.memory) throw Error("The saved conditions were not recalled.");
      setMemory(d.memory);
      setS((w) => ({ ...w, useMemory: true }));
      setNotice(
        "Saved and recalled from GBrain. Change a revision to see which work must run again.",
      );
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy("");
    }
  }
  async function decide() {
    setBusy("Asking Jev");
    try {
      const d = await api("decide", {
        id,
        state: workCase(s, role, issue),
        provider: "jev",
      });
      setAnswer(d);
      setNotice(
        "Decision returned. This recommendation does not execute work.",
      );
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="ops-app work-app">
      <header className="ops-header">
        <a className="ops-brand" href="/">
          ✳ Impactor <span className="version">WORKPLACE</span>
        </a>
        <nav>
          <a href="/">Delivery lab</a>
          <a href="/bridge">Bridge experiment</a>
        </nav>
      </header>
      <main className="ops-main">
        <div className="ops-intro">
          <div>
            <p className="eyebrow">Planning across teams</p>
            <h1>What changes at 100 agents?</h1>
          </div>
          <p className="work-subtitle">
            More workers, the same shared constraints.
            <br />
            Compare simulated schedules and estimated costs.
          </p>
        </div>
        <div className="mission-picker">
          {(
            Object.entries(MISSIONS) as Array<
              [Mission, (typeof MISSIONS)[Mission]]
            >
          ).map(([k, m]) => (
            <button
              disabled={playing || Boolean(busy)}
              className={s.mission === k ? "selected" : ""}
              key={k}
              onClick={() => change("mission", k)}
            >
              {m.name}
            </button>
          ))}
        </div>
        <div className="goal-bar">
          <GitBranch />
          <div>
            <label>Shared goal</label>
            <p>{MISSIONS[s.mission].goal}</p>
          </div>
          <strong>{result.tasks.length} tasks · 6 teams</strong>
        </div>
        <div className="ops-workspace">
          <section className="ops-stage">
            <OfficeScene
              result={result}
              playing={playing}
              onFinished={finished}
            />
            <div className="ops-actions">
              <button
                className="ops-btn primary"
                onClick={() => setPlaying(true)}
                disabled={playing || Boolean(busy)}
              >
                <Play size={16} />
                {playing ? "Watching the schedule" : "Run the workplace"}
              </button>
              <button
                className="ops-btn secondary"
                onClick={remember}
                disabled={playing || Boolean(busy)}
              >
                <Save size={16} />
                Remember completed checks
              </button>
              <label className="hot-loop">
                <input
                  type="checkbox"
                  checked={s.useMemory}
                  disabled={!memory || playing}
                  onChange={(e) => change("useMemory", e.target.checked)}
                />
                Reuse matching results
              </label>
            </div>
            <div className="run-message">
              {busy ||
                notice ||
                "The schedule respects dependencies, build capacity and reviewer availability."}
            </div>
          </section>
          <aside className="ops-controls">
            <div className="control-head">
              <h2>Change the workplace</h2>
              <Users size={18} />
            </div>
            <div className="agent-presets">
              {[3, 12, 25, 50, 100].map((n) => (
                <button
                  className={s.agents === n ? "selected" : ""}
                  key={n}
                  disabled={playing}
                  onClick={() => change("agents", n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="ops-sliders">
              {(
                [
                  {
                    key: "agents",
                    name: "Concurrent agents",
                    min: 3,
                    max: 100,
                    step: 1,
                  },
                  {
                    key: "streams",
                    name: "Parallel workstreams",
                    min: 1,
                    max: 24,
                    step: 1,
                  },
                  {
                    key: "reviewers",
                    name: "Review slots",
                    min: 1,
                    max: 12,
                    step: 1,
                  },
                  {
                    key: "buildSlots",
                    name: "Build slots",
                    min: 1,
                    max: 12,
                    step: 1,
                  },
                  {
                    key: "handoff",
                    name: "Handoff minutes",
                    min: 0,
                    max: 10,
                    step: 1,
                  },
                ] as const
              ).map((c) => (
                <label key={c.key}>
                  <span>
                    {c.name}
                    <strong>{s[c.key]}</strong>
                  </span>
                  <input
                    disabled={playing}
                    type="range"
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    value={s[c.key]}
                    onChange={(e) => change(c.key, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
            <div className="revision-buttons">
              <span>Change an input</span>
              {(
                [
                  { key: "codeRevision", name: "Code" },
                  { key: "offerRevision", name: "Offer" },
                  { key: "customerRevision", name: "Customer config" },
                ] as const
              ).map((c) => (
                <button
                  key={c.key}
                  disabled={playing}
                  onClick={() => change(c.key, s[c.key] + 1)}
                >
                  {c.name} v{s[c.key]} <RefreshCw size={11} />
                </button>
              ))}
            </div>
            <p className="world-footnote">
              All work is simulated. Changing a dependency invalidates its
              downstream results.
            </p>
          </aside>
        </div>
        <section className="work-results">
          <div className="evidence-top">
            <div>
              <p className="eyebrow">Same goal and agent count</p>
              <h2>Full rerun versus scoped work</h2>
            </div>
            <p>
              Baseline broadcasts every handoff. Planned work routes each
              handoff to its owner.
            </p>
          </div>
          <div className="forecast-grid">
            {[
              [
                "Finish time",
                `${baseline.minutes.toFixed(0)} min`,
                `${result.minutes.toFixed(0)} min`,
              ],
              [
                "Estimated API spend",
                money(baseline.apiCost),
                money(result.apiCost),
              ],
              [
                "Handoff messages",
                baseline.handoffMessages,
                result.handoffMessages,
              ],
              ["Repeated tasks avoided", 0, result.reused],
            ].map(([label, a, b]) => (
              <div className="forecast-metric" key={String(label)}>
                <span>{label}</span>
                <div>
                  <strong>{a}</strong>
                  <ArrowRight size={16} />
                  <strong>{b}</strong>
                </div>
                <footer>
                  <span>Full rerun</span>
                  <span>Scoped work</span>
                </footer>
              </div>
            ))}
          </div>
          <div className="work-chart-row">
            <div className="scale-chart">
              <h3>Where more agents stop helping</h3>
              <svg
                viewBox="0 0 650 205"
                role="img"
                aria-label="Schedule finishing time from 3 to 100 agents"
              >
                <path d="M35 15V170H630" stroke="#ccd6c5" fill="none" />
                {scaling.map((r, i) => {
                  const max = Math.max(
                      ...scaling.map((x) => x.baseline.minutes),
                    ),
                    x = 50 + i * 110,
                    y = 165 - (r.planned.minutes / max) * 140,
                    by = 165 - (r.baseline.minutes / max) * 140;
                  return (
                    <g key={r.agents}>
                      {i > 0 && (
                        <>
                          <line
                            x1={50 + (i - 1) * 110}
                            y1={
                              165 - (scaling[i - 1].planned.minutes / max) * 140
                            }
                            x2={x}
                            y2={y}
                            stroke="#74946e"
                            strokeWidth="3"
                          />
                          <line
                            x1={50 + (i - 1) * 110}
                            y1={
                              165 -
                              (scaling[i - 1].baseline.minutes / max) * 140
                            }
                            x2={x}
                            y2={by}
                            stroke="#d28c72"
                            strokeWidth="2"
                          />
                        </>
                      )}
                      <circle cx={x} cy={y} r="5" fill="#74946e" />
                      <circle cx={x} cy={by} r="4" fill="#d28c72" />
                      <text x={x} y={y - 10} textAnchor="middle">
                        {r.planned.minutes.toFixed(0)}m
                      </text>
                      <text x={x} y="196" textAnchor="middle">
                        {r.agents} agents
                      </text>
                    </g>
                  );
                })}
              </svg>
              <p>
                <i className="legend-dot planned" />
                Scoped handoffs <i className="legend-dot baseline" />
                Broadcast handoffs
              </p>
            </div>
            <div className="work-assumptions">
              <h3>Cost assumptions you can change</h3>
              <label>
                Task input cost per million tokens{" "}
                <input
                  type="number"
                  min="0"
                  max="50"
                  step=".25"
                  value={s.inputUsdPerMillion}
                  onChange={(e) =>
                    change(
                      "inputUsdPerMillion",
                      Math.min(50, Math.max(0, Number(e.target.value))),
                    )
                  }
                />
              </label>
              <label>
                Task tokens per work-minute{" "}
                <input
                  type="number"
                  min="20"
                  max="2000"
                  step="20"
                  value={s.tokensPerMinute}
                  onChange={(e) =>
                    change(
                      "tokensPerMinute",
                      Math.min(2000, Math.max(20, Number(e.target.value))),
                    )
                  }
                />
              </label>

              <p>
                Includes task input tokens, 120 tokens per handoff message and
                400 tokens per decision at Jev's published $0.042/M input rate.
                Hardware, electricity and output tokens are excluded.
              </p>
              <small>
                This chart models a workload. It does not launch 100 paid agents
                or measure production savings.
              </small>
            </div>
          </div>
          <div className="task-map-heading">
            <h3>Inspect the task plan</h3>
            <span>
              {result.reused} reused · {result.tasks.length - result.reused} to
              run · {result.busyAgents} agents assigned
            </span>
          </div>
          <div
            className="work-dag"
            role="list"
            aria-label="Tasks arranged by workstream and stage"
          >
            {Array.from({ length: s.streams }, (_, stream) => (
              <div className="dag-row" key={stream}>
                <span>{String(stream + 1).padStart(2, "0")}</span>
                {result.tasks
                  .filter((t) => t.stream === stream && t.id !== "final")
                  .map((t) => (
                    <button
                      role="listitem"
                      key={t.id}
                      title={`${t.name}: ${t.reused ? "reused" : `${t.start.toFixed(0)}–${t.finish.toFixed(0)} min`}`}
                      className={t.reused ? "reused" : ""}
                      style={{ borderColor: TEAMS[t.team].color }}
                      onClick={() => setSelected(t.id)}
                    >
                      <b>{t.stage + 1}</b>
                      <small>{TEAMS[t.team].name}</small>
                    </button>
                  ))}
              </div>
            ))}
          </div>
          {current && (
            <div className="task-details">
              <strong>{current.name}</strong>
              <span>
                {current.reused
                  ? "Recalled conditions match"
                  : `${current.start.toFixed(1)}–${current.finish.toFixed(1)} minutes · agent ${current.agent + 1}`}
              </span>
              <p>
                Requires:{" "}
                {current.deps
                  .map((id) => result.tasks.find((t) => t.id === id)?.name)
                  .join(", ") || "No prerequisites"}
                . Waited {current.wait.toFixed(1)} minutes for an agent or
                shared resource.
              </p>
              <code>{current.scope}</code>
            </div>
          )}
        </section>
        <section className="work-judge">
          <div>
            <p className="eyebrow">Use the same idea at work</p>
            <h2>Can I still use this result?</h2>
            <p>
              The decision is whether to reuse, refresh a source, rerun a
              focused check or ask for clarification. It uses the current inputs
              and the conditions behind the previous conclusion.
            </p>
            <div className="mission-picker">
              {(Object.entries(ROLE_NAMES) as Array<[WorkRole, string]>).map(
                ([k, v]) => (
                  <button
                    className={role === k ? "selected" : ""}
                    key={k}
                    onClick={() => {
                      setRole(k);
                      setAnswer(null);
                    }}
                  >
                    {v}
                  </button>
                ),
              )}
            </div>
            <label>
              Additional condition{" "}
              <select
                value={issue}
                onChange={(e) => {
                  setIssue(e.target.value);
                  setAnswer(null);
                }}
              >
                <option value="none">Sources current</option>
                <option value="stale">Source expired</option>
                <option value="missing">Required fact missing</option>
                <option value="conflict">Authoritative sources conflict</option>
              </select>
            </label>
            <div className="judge-actions">
              <button
                className="ops-btn primary"
                onClick={decide}
                disabled={Boolean(busy)}
              >
                <BrainCircuit size={16} />
                Assess this context
              </button>
            </div>
          </div>
          <div className="judge-result">
            {answer ? (
              <>
                <span>TypeSafe Jev</span>
                <h3>
                  {ACTION_NAMES[answer.answers?.action?.choice] ||
                    answer.answers?.action?.choice}
                </h3>
                <p>
                  {answer.latencyMs} ms request time. This is a recommendation
                  for this context.
                </p>
                <div>
                  {Object.entries(
                    answer.answers?.action?.probabilities || {},
                  ).map(([k, v]) => (
                    <p key={k}>
                      {ACTION_NAMES[k]}{" "}
                      <strong>{(Number(v) * 100).toFixed(0)}%</strong>
                    </p>
                  ))}
                </div>
              </>
            ) : (
              <>
                <BrainCircuit size={28} />
                <h3>One narrow decision before the next step</h3>
                <p>
                  Change a code, offer or customer revision above, then ask
                  whether the old conclusion still applies.
                </p>
              </>
            )}
            <details>
              <summary>Inputs used for this decision</summary>
              <pre>{JSON.stringify(workCase(s, role, issue), null, 2)}</pre>
            </details>
          </div>
        </section>
        <footer className="ops-footer">
          <span>
            GBrain ·{" "}
            {memory?.source === "gbrain"
              ? "task conditions recalled"
              : "no saved task conditions"}
          </span>
          <span>TypeSafe Jev · typed decisions</span>
          <span>River training remains in the delivery lab.</span>
        </footer>
      </main>
    </div>
  );
}
