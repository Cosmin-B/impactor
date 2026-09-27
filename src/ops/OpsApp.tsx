import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronRight,
  FlaskConical,
  GitBranch,
  Layers3,
  LoaderCircle,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import {
  DEFAULT_OPS,
  DEFAULT_GOAL,
  FACTOR_NAMES,
  type OpsState,
  type OpsWorld,
  type Relationship,
} from "../../shared/ops/types";
import { JOBS, POLICY_NAMES } from "../../shared/ops/engine";
import {
  memoryContracts,
  selectVariants,
} from "../../shared/ops/conditional-memory";
import { RiverPanel } from "./RiverPanel";
import { CityScene } from "./CityScene";
import "./ops.css";
const presets = [
  { name: "Morning shift", world: DEFAULT_OPS },
  {
    name: "Storm + heavy cargo",
    world: {
      ...DEFAULT_OPS,
      rain: 85,
      payload: 1.7,
      battery: 50,
      traffic: 1.8,
    },
  },
  {
    name: "Deadline squeeze",
    world: { ...DEFAULT_OPS, deadline: 0.7, traffic: 2.1, liftClosed: true },
  },
  {
    name: "Small fleet",
    world: { ...DEFAULT_OPS, agents: 1, battery: 40, payload: 1.3 },
  },
];
const sliders: Array<{
  key: keyof OpsWorld;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}> = [
  { key: "agents", label: "Robots", min: 1, max: 8, step: 1, unit: "" },
  { key: "rain", label: "Rain", min: 0, max: 100, step: 5, unit: "%" },
  {
    key: "payload",
    label: "Parcel weights",
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  {
    key: "battery",
    label: "Starting battery",
    min: 20,
    max: 100,
    step: 5,
    unit: "%",
  },
  {
    key: "bridgeLimit",
    label: "Bridge capacity",
    min: 3,
    max: 20,
    step: 1,
    unit: " kg",
  },
  {
    key: "traffic",
    label: "Road traffic",
    min: 0.7,
    max: 3,
    step: 0.1,
    unit: "×",
  },
  {
    key: "deadline",
    label: "Delivery windows",
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
];
async function api(action: string, body: unknown) {
  const r = await fetch(`/api/ops/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "The request could not complete.");
  return data.state as OpsState;
}
export default function OpsApp() {
  const [state, setState] = useState<OpsState | null>(null),
    [world, setWorld] = useState<OpsWorld>({ ...DEFAULT_OPS }),
    [goal, setGoal] = useState(DEFAULT_GOAL),
    [busy, setBusy] = useState("Starting your workspace"),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false),
    [tab, setTab] = useState("predictions"),
    [hotLoop, setHotLoop] = useState(true),
    [activeRelation, setActiveRelation] = useState<Relationship | null>(null),
    [notice, setNotice] = useState("");
  const lock = useRef(false),
    request = useRef<Promise<OpsState> | null>(null),
    [selectedVisit, setSelectedVisit] = useState<string | null>(null);
  const [id] = useState(() => {
    let value = localStorage.getItem("impactor-ops-id");
    if (!value) {
      value = crypto.randomUUID();
      localStorage.setItem("impactor-ops-id", value);
    }
    return value;
  });
  useEffect(() => {
    let active = true;
    request.current ??= api("session", { id });
    request.current
      .then((s) => {
        if (active) {
          setState(s);
          setWorld(s.world);
          setGoal(s.goal);
          setBusy("");
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setBusy("");
        }
      });
    return () => {
      active = false;
    };
  }, [id]);
  const finished = useCallback(() => setPlaying(false), []);
  const run = state?.history.at(-1) || null;
  const forecast = state?.forecast;
  const forecastCurrent =
    forecast &&
    JSON.stringify(forecast.world) === JSON.stringify(world) &&
    forecast.goal === goal;
  const runCurrent = Boolean(
    run &&
    JSON.stringify(run.world) === JSON.stringify(world) &&
    run.goal === goal,
  );
  const predicted = forecastCurrent
    ? forecast.plans.find((p) => p.policy === forecast.decision.choice)
    : runCurrent
      ? run?.forecast
      : undefined;
  const observed = runCurrent && !forecastCurrent ? run?.plan : undefined;
  const contracts = memoryContracts(state?.relationships || [], world);
  const supported = contracts.filter(
    (r) => r.applicability === "supported_here",
  ).length;
  const needsRetest = contracts.length - supported;
  const contextChanges = (r: Relationship) =>
    (Object.keys(r.context) as Array<keyof OpsWorld>)
      .filter(
        (key) =>
          key !== "paint" && key !== r.factor && r.context[key] !== world[key],
      )
      .map((key) => `${FACTOR_NAMES[key]}: ${r.context[key]} → ${world[key]}`);
  const variants = selectVariants(state?.variants || [], world, goal);
  const disabled = Boolean(busy || playing);
  async function act(action: "forecast" | "run" | "learn" | "session") {
    if (lock.current || playing) return;
    lock.current = true;
    setError("");
    setNotice("");
    setBusy(
      action === "forecast"
        ? "Jev is comparing four plans"
        : action === "run"
          ? hotLoop
            ? "Jev is checking each dispatch against the goal"
            : "Running the selected plan"
          : action === "learn"
            ? "Running 18 controlled trials and saving the results"
            : "Recalling memory into a fresh agent",
    );
    try {
      const next = await api(action, {
        id,
        world,
        goal,
        hotLoop,
        fresh: action === "session",
      });
      setState(next);
      if (action === "run") setPlaying(true);
      if (action === "learn") {
        setActiveRelation(null);
        setTab("relationships");
        setNotice(
          "Nine factors tested. Results saved and recalled from GBrain.",
        );
      }
      if (action === "forecast") setTab("predictions");
      if (action === "session")
        setNotice(
          next.relationships.length
            ? "Fresh agent. Saved relationships recalled from GBrain."
            : "Fresh agent. No saved relationships found.",
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete this step.",
      );
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  const change = (key: keyof OpsWorld, value: unknown) =>
    setWorld((w) => ({ ...w, [key]: value }));
  return (
    <div className="ops-app">
      <header className="ops-header">
        <a className="ops-brand" href="/">
          <span>✳</span>Impactor<span className="version">OPERATIONS LAB</span>
        </a>
        <nav>
          <a href="/workplace">Workplace · 3–100 agents</a>
          <a href="/bridge">The first experiment</a>
          <span className="network-light" />
          Goal → decisions → consequences
        </nav>
      </header>
      <main className="ops-main">
        <div className="ops-intro">
          <div>
            <p className="eyebrow">Robot delivery simulation</p>
            <h1>Plan a delivery shift.</h1>
          </div>
          <div className="shift-summary">
            <span>DELIVERY SIMULATION</span>
            <strong>
              {world.agents} robots <em>/</em> 6 deliveries
            </strong>
            <p>Compare a forecast with the completed shift.</p>
          </div>
        </div>
        <section className="goal-bar">
          <Target size={21} />
          <div>
            <label htmlFor="mission-goal">
              What does a good outcome look like?
            </label>
            <textarea
              id="mission-goal"
              value={goal}
              disabled={disabled}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={600}
              rows={2}
            />
          </div>
          <button
            disabled={disabled || !state}
            onClick={() => act("forecast")}
            className="ops-btn secondary"
          >
            <BrainCircuit size={16} />
            Forecast with Jev
          </button>
        </section>
        {error && (
          <div role="alert" className="ops-error">
            {error}
            <button
              onClick={() => {
                setError("");
                act("session");
              }}
            >
              Reconnect
            </button>
          </div>
        )}
        <div className="ops-workspace">
          <section className="ops-stage">
            <div className="scene-meta">
              <span>
                <i />
                Riverside district
              </span>
              <span>
                SCENARIO {String((state?.round || 0) + 1).padStart(2, "0")}
              </span>
            </div>
            <CityScene
              world={world}
              run={runCurrent ? run : null}
              playing={playing}
              onFinished={finished}
            />
            <div className="ops-actions">
              <button
                className="ops-btn primary"
                disabled={disabled || !state}
                onClick={() => act("run")}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Play size={16} />
                )}{" "}
                {playing
                  ? "Watching the shift"
                  : busy
                    ? "Working…"
                    : "Run the shift"}
              </button>
              <button
                className="ops-btn secondary"
                disabled={disabled || !state}
                onClick={() => act("learn")}
              >
                <FlaskConical size={16} />
                Find relationships
              </button>
              <button
                className="ops-btn quiet"
                disabled={disabled || !state}
                onClick={() => act("session")}
              >
                <RefreshCw size={15} />
                Fresh agent
              </button>
              <label className="hot-loop">
                <input
                  type="checkbox"
                  checked={hotLoop}
                  disabled={disabled}
                  onChange={(e) => setHotLoop(e.target.checked)}
                />
                <Zap size={14} />
                Jev in the loop
              </label>
            </div>
            <div className="run-message" aria-live="polite">
              {busy ||
                notice ||
                (run
                  ? `${run.plan.delivered}/6 delivered · ${run.plan.onTime} on time · ${run.decisions?.length || 0} Jev dispatch decisions`
                  : "Start with a forecast. Then change the world and see where its assumptions fail.")}
            </div>
          </section>
          <aside className="ops-controls">
            <div className="control-head">
              <h2>Change the conditions</h2>
              <Layers3 size={18} />
            </div>
            <div className="presets">
              {presets.map((p) => (
                <button
                  key={p.name}
                  disabled={disabled}
                  onClick={() => setWorld({ ...p.world })}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="ops-sliders">
              {sliders.map((s) => (
                <label key={s.key}>
                  <span>
                    {s.label}
                    <strong>
                      {typeof world[s.key] === "number"
                        ? Number(world[s.key]) % 1
                          ? Number(world[s.key]).toFixed(1)
                          : world[s.key]
                        : ""}
                      {s.unit}
                    </strong>
                  </span>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={Number(world[s.key])}
                    disabled={disabled}
                    onChange={(e) => change(s.key, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
            <label className="lift-toggle">
              <input
                type="checkbox"
                checked={world.liftClosed}
                disabled={disabled}
                onChange={(e) => change("liftClosed", e.target.checked)}
              />
              Studio lift is closed
            </label>
            <div className="paint-pick">
              <span>
                Robot paint <small>Negative control</small>
              </span>
              {(["coral", "teal", "gold"] as const).map((c) => (
                <button
                  key={c}
                  aria-label={`${c} robots`}
                  className={c + (world.paint === c ? " chosen" : "")}
                  disabled={disabled}
                  onClick={() => change("paint", c)}
                />
              ))}
            </div>
            <p className="world-footnote">
              Delivery times and battery use are calculated by this simulator.
            </p>
          </aside>
        </div>
        <section
          className="reuse-summary"
          aria-label="Memory applicability"
          aria-live="polite"
        >
          <div className="reuse-question">
            <p className="eyebrow">Before the next decision</p>
            <h2>Can I still use this result?</h2>
            <p>
              {contracts.length
                ? "The observations stay in memory. Only matching experiment contexts inform the forecast."
                : "Run Find relationships, then change a condition to see which experiment contexts still match."}
            </p>
          </div>
          <div className="reuse-counts">
            <div>
              <strong>{supported}</strong>
              <span>factors with matching context</span>
            </div>
            <div className={needsRetest ? "needs-retest" : ""}>
              <strong>{needsRetest}</strong>
              <span>factors needing retest</span>
            </div>
            <div>
              <strong>{9 - contracts.length}</strong>
              <span>untested factors</span>
            </div>
          </div>
          <div className="reuse-actions">
            <button
              className="ops-btn secondary"
              disabled={disabled || !contracts.length}
              onClick={() =>
                change("paint", world.paint === "teal" ? "coral" : "teal")
              }
            >
              Change only paint
            </button>
            <button
              className="ops-btn secondary"
              disabled={disabled || !contracts.length}
              onClick={() => change("payload", world.payload === 1.7 ? 1 : 1.7)}
            >
              Change parcel weight
            </button>
            <button
              className="ops-btn quiet"
              onClick={() => {
                setTab("memory");
                document
                  .getElementById("shift-results")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              Show why <ChevronRight size={14} />
            </button>
          </div>
        </section>
        <details className="tool-contributions">
          <summary>How the tools reduce repeated work</summary>
          <p>
            Impactor adds conditions and observed outcomes to recalled
            experiments and procedure branches, then checks whether they apply
            to this shift.
          </p>
          <div className="tool-contribution-grid">
            <article>
              <strong>GBrain</strong>
              <h3>Remember what was tested</h3>
              <p>
                Recalls the experiments and their conditions, so a fresh agent
                can use the investigation already done.
              </p>
            </article>
            <article>
              <strong>Memorable</strong>
              <h3>Retrieve the checking procedure</h3>
              <p>
                Finds a saved procedure. Impactor attaches execution branches
                with their conditions and outcomes for the next plan.
              </p>
            </article>
            <article>
              <strong>TypeSafe Jev</strong>
              <h3>Choose the next action</h3>
              <p>
                Uses the goal and applicable memory to choose a plan, then
                decides whether each delivery should proceed, charge, detour or
                wait.
              </p>
            </article>
            <article>
              <strong>River AI · experiment</strong>
              <h3>Train on simulated decisions</h3>
              <p>
                A fine-tuned adapter returned the expected action labels on nine
                held-out examples. This is a format-adaptation test; Jev
                controls the live deliveries.
              </p>
              <button
                className="ops-btn quiet"
                onClick={() => {
                  setTab("training");
                  document
                    .getElementById("shift-results")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                See training results <ChevronRight size={14} />
              </button>
            </article>
          </div>
        </details>
        <section className="ops-evidence" id="shift-results">
          <div className="evidence-top">
            <div>
              <p className="eyebrow">Shift results</p>
              <h2>Forecasts and decisions</h2>
            </div>
            <div className="evidence-tabs" role="tablist">
              {[
                ["predictions", "Forecast vs. observed"],
                ["relationships", "Relationship graph"],
                ["decisions", "Jev decisions"],
                ["deliveries", "Delivery timeline"],
                ["memory", "Conditional memory"],
                ["training", "River training"],
              ].map(([key, title]) => (
                <button
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  key={key}
                >
                  {title}
                </button>
              ))}
            </div>
          </div>
          {tab === "predictions" && (
            <>
              <div className="forecast-grid">
                {[
                  ["On time", predicted?.onTime, observed?.onTime, "/ 6"],
                  [
                    "Delivered",
                    predicted?.delivered,
                    observed?.delivered,
                    "/ 6",
                  ],
                  [
                    "Finish time",
                    predicted ? Math.round(predicted.minutes) : null,
                    observed ? Math.round(observed.minutes) : null,
                    "min",
                  ],
                  [
                    "Battery demand",
                    predicted ? Math.round(predicted.energy) : null,
                    observed ? Math.round(observed.energy) : null,
                    "% total",
                  ],
                ].map(([label, p, a, unit]) => (
                  <div className="forecast-metric" key={String(label)}>
                    <span>{label}</span>
                    <div>
                      <strong>
                        {p ?? "—"}
                        <small>{unit}</small>
                      </strong>
                      <ArrowRight size={18} />
                      <strong
                        className={p !== a && a !== undefined ? "changed" : ""}
                      >
                        {a ?? "—"}
                        <small>{unit}</small>
                      </strong>
                    </div>
                    <footer>
                      <span>Forecast</span>
                      <span>Observed</span>
                    </footer>
                  </div>
                ))}
              </div>
              <div className="prediction-bottom">
                <div className="forecast-note">
                  <BrainCircuit />
                  <h3>
                    {forecastCurrent
                      ? POLICY_NAMES[forecast.decision.choice]
                      : run?.decision
                        ? POLICY_NAMES[run.decision.choice]
                        : "Selected strategy"}
                  </h3>
                  <p>
                    {forecastCurrent
                      ? forecast.decision.reason
                      : run?.decision.reason ||
                        "Jev compares four strategies against your goal. The forecast uses the dependencies the agent currently knows."}
                  </p>
                  <small>
                    Unknown dependencies use baseline assumptions. Model
                    confidence describes a choice, not the probability the
                    entire shift succeeds.
                  </small>
                </div>
                <div className="scaling-chart">
                  <h3>Finish time by fleet size</h3>
                  <p>Predicted finish time by fleet size</p>
                  {run?.scaling ? (
                    <>
                      <svg
                        viewBox="0 0 520 140"
                        role="img"
                        aria-label="Predicted finish time by fleet size"
                      >
                        <path d="M25 10V115H505" fill="none" stroke="#cbd3c5" />
                        {run.scaling.map((s, i) => {
                          const x = 35 + i * 90,
                            y =
                              110 -
                              (s.minutes /
                                Math.max(
                                  ...run.scaling!.map((x) => x.minutes),
                                )) *
                                90;
                          return (
                            <g key={s.agents}>
                              {i > 0 && (
                                <line
                                  x1={35 + (i - 1) * 90}
                                  y1={
                                    110 -
                                    (run.scaling![i - 1].minutes /
                                      Math.max(
                                        ...run.scaling!.map((x) => x.minutes),
                                      )) *
                                      90
                                  }
                                  x2={x}
                                  y2={y}
                                  stroke="#da765c"
                                  strokeWidth="2.5"
                                />
                              )}
                              <circle cx={x} cy={y} r="4" fill="#da765c" />
                              <text x={x} y={y - 10} textAnchor="middle">
                                {s.minutes.toFixed(0)}m
                              </text>
                              <text x={x} y="134" textAnchor="middle">
                                {s.agents} bots
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                      <small>
                        Forecast from this simulator; not a measured real-world
                        speedup.
                      </small>
                    </>
                  ) : (
                    <div className="chart-empty">
                      Run a shift to compare 1, 2, 3, 4, 6 and 8 robots.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {tab === "relationships" && (
            <div className="relationship-panel">
              <div className="dependency-map">
                <div className="map-columns">
                  <span>CONDITIONS</span>
                  <span>MEASURED CONSEQUENCES</span>
                  <span>END GOAL</span>
                </div>
                <div className="causal-content">
                  <svg
                    className="causal-lines"
                    viewBox="0 0 1000 430"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {state?.relationships.flatMap((r, i) =>
                      r.affects.map((effect) => {
                        const j = [
                          "successful deliveries",
                          "deadlines",
                          "battery demand",
                          "trip duration",
                        ].indexOf(effect);
                        return (
                          <path
                            key={`${r.factor}-${effect}`}
                            className={
                              contracts.find((c) => c.factor === r.factor)
                                ?.applicability === "needs_retest"
                                ? "stale-link"
                                : ""
                            }
                            d={`M280 ${24 + i * 45} C355 ${24 + i * 45} 340 ${55 + j * 100} 415 ${55 + j * 100}`}
                          />
                        );
                      }),
                    )}
                    {[0, 1, 2, 3].map((i) => (
                      <path
                        key={i}
                        d={`M650 ${55 + i * 100} C740 ${55 + i * 100} 730 215 825 215`}
                      />
                    ))}
                  </svg>
                  <div className="factor-column">
                    {(state?.relationships.length
                      ? state.relationships
                      : Object.keys(FACTOR_NAMES).map((factor) => ({
                          factor,
                          affects: [],
                          source: "unknown",
                        }))
                    ).map((r: any) => (
                      <button
                        onClick={() => "measured" in r && setActiveRelation(r)}
                        className={
                          (r.affects.length ? "has-link" : "unproven") +
                          (contracts.find((c) => c.factor === r.factor)
                            ?.applicability === "needs_retest"
                            ? " stale-factor"
                            : "")
                        }
                        key={r.factor}
                      >
                        <i />
                        {FACTOR_NAMES[r.factor as keyof OpsWorld]}
                        <small>
                          {r.source === "unknown"
                            ? "untested"
                            : contracts.find((c) => c.factor === r.factor)
                                  ?.applicability === "needs_retest"
                              ? "context changed"
                              : r.affects.length
                                ? `${r.affects.length} links`
                                : "no effect observed"}
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="effect-column">
                    {[
                      "successful deliveries",
                      "deadlines",
                      "battery demand",
                      "trip duration",
                    ].map((effect) => (
                      <div key={effect}>
                        <GitBranch size={17} />
                        <strong>{effect}</strong>
                        <small>
                          {state?.relationships
                            .filter((r) => r.affects.includes(effect))
                            .map((r) => FACTOR_NAMES[r.factor])
                            .join(" · ") ||
                            "Run controlled experiments to find dependencies."}
                        </small>
                      </div>
                    ))}
                  </div>
                  <div className="goal-node">
                    <Target size={27} />
                    <strong>Your goal</strong>
                    <p>{goal}</p>
                    <span>
                      {state?.relationships.length || 0} tested factors
                    </span>
                  </div>
                </div>
              </div>
              <div className="relationship-details">
                <FlaskConical />
                <h3>
                  {activeRelation
                    ? FACTOR_NAMES[activeRelation.factor]
                    : "Controlled experiments"}
                </h3>
                <p>
                  {activeRelation?.measured ||
                    "Find relationships runs two contrasting values for each factor while holding the rest of the world fixed. Select a tested factor to compare the two results."}
                </p>
                {activeRelation && (
                  <small>
                    {activeRelation.trials} controlled trials ·{" "}
                    {activeRelation.source === "gbrain"
                      ? "Recalled from GBrain"
                      : "Observed in this simulation"}
                  </small>
                )}
                <p className="method-note">
                  These are relationships demonstrated in this simulator, at
                  these settings. A new context can change their effects.
                </p>
              </div>
            </div>
          )}
          {tab === "decisions" && (
            <div className="decision-panel">
              <div className="jev-summary">
                <BrainCircuit size={28} />
                <h3>
                  {run?.decision.model ||
                    forecast?.decision.model ||
                    "Jev, in the decision loop."}
                </h3>
                <p>
                  {run?.decision.reason ||
                    forecast?.decision.reason ||
                    "Every dispatch can ask a narrow question: proceed, charge, detour, or hold. Later decisions see jobs completed before dispatch."}
                </p>
                <strong>
                  {run?.decision.confidence !== null &&
                  run?.decision.confidence !== undefined
                    ? `${Math.round(run.decision.confidence * 100)}% choice confidence`
                    : ""}
                </strong>
                <small>
                  {run
                    ? `${run.decision.latencyMs} ms API request time · ${run.decision.inputTokens} input tokens`
                    : ""}
                </small>
                {run?.procedure && (
                  <div className="procedure-note">
                    <span>MEMORABLE PROCEDURE</span>
                    <strong>{run.procedure.title}</strong>
                    <p>
                      Retrieved a saved delivery procedure and included it in
                      Jev's plan comparison.
                    </p>
                  </div>
                )}
              </div>
              <div className="decision-list">
                {run?.decisions?.length ? (
                  run.decisions.map((d, i) => (
                    <div key={d.job}>
                      <span className="decision-index">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>
                          {JOBS.find((j) => j.id === d.job)?.name}
                        </strong>
                        <small>Completed deliveries → next dispatch</small>
                      </div>
                      <b>{d.action}</b>
                      <span>
                        {Math.round(d.confidence * 100)}%
                        <small>{d.latencyMs} ms</small>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="chart-empty">
                    Enable "Jev in the loop" and run a shift. Actual decisions
                    and measured API latency will appear here.
                  </p>
                )}
              </div>
            </div>
          )}
          {tab === "training" && <RiverPanel />}
          {tab === "memory" && (
            <div className="memory-extension">
              <div>
                <h3>When does a remembered result still apply?</h3>
                <p>
                  GBrain stores the intervention, measured change and
                  surrounding conditions. Impactor checks that context before
                  the forecast uses the result. Changing robot paint leaves
                  physical results applicable.
                </p>
                <div className="memory-contracts">
                  {contracts.length ? (
                    contracts.map((r) => (
                      <article key={r.id}>
                        <strong>{FACTOR_NAMES[r.factor]}</strong>
                        <b className={r.applicability}>
                          {r.applicability === "supported_here"
                            ? "Context matches"
                            : "Retest in this context"}
                        </b>
                        <p>{r.measured}</p>
                        {contextChanges(r).length > 0 && (
                          <p className="context-diff">
                            <strong>What changed</strong>
                            {contextChanges(r).join(" · ")}
                          </p>
                        )}
                        {r.policy && (
                          <small>
                            Tested strategy: {POLICY_NAMES[r.policy]}.{" "}
                          </small>
                        )}
                        <small>
                          Retest if repeating these trials produces a different
                          result.
                        </small>
                      </article>
                    ))
                  ) : (
                    <p>Run Find relationships to create scoped memories.</p>
                  )}
                </div>
              </div>
              <div>
                <h3>Procedure branches with observed outcomes</h3>
                <p>
                  Memorable retrieves a saved procedure. Impactor attaches the
                  conditions, dispatch actions and results of each execution,
                  then recalls those branches from GBrain for Jev's next plan
                  comparison.
                </p>
                {variants.length ? (
                  variants.map((v) => (
                    <article className="variant" key={v.id}>
                      <strong>{v.procedureTitle}</strong>
                      <b>
                        {v.applicable
                          ? "Same conditions and goal"
                          : "Historical context"}
                      </b>
                      <p>
                        {v.outcome.delivered}/6 delivered, {v.outcome.onTime} on
                        time. {v.actions.map((a) => a.action).join(" → ")}
                      </p>
                    </article>
                  ))
                ) : (
                  <p>Run a shift with Jev to record the first branch.</p>
                )}
                <small>
                  This is an application extension around GBrain and Memorable.
                  Their upstream storage and retrieval implementations are
                  unchanged.
                </small>
              </div>
            </div>
          )}
          {tab === "deliveries" && (
            <div className="delivery-table">
              {JOBS.map((job) => {
                const v = runCurrent
                  ? run?.plan.visits.find((v) => v.jobId === job.id)
                  : undefined;
                return (
                  <button
                    className="delivery-row"
                    key={job.id}
                    onClick={() =>
                      setSelectedVisit(selectedVisit === job.id ? null : job.id)
                    }
                  >
                    <span>
                      <strong>{job.name}</strong>
                      <small>
                        {job.mass * world.payload} kg · due{" "}
                        {(job.due * world.deadline).toFixed(0)} min
                      </small>
                    </span>
                    <span className="timeline-track">
                      {v && (
                        <i
                          style={{
                            left: `${(v.departure / run!.plan.minutes) * 100}%`,
                            width: `${((v.arrival - v.departure) / run!.plan.minutes) * 100}%`,
                            background:
                              v.status === "delivered" ? "#79a487" : "#df9772",
                          }}
                        />
                      )}
                    </span>
                    <span className={`delivery-status ${v?.status}`}>
                      {v?.status || "Waiting"}
                    </span>
                    {selectedVisit === job.id && v && (
                      <p>
                        {v.reason} Route: {v.path.join(" → ")}.{" "}
                        {v.charged ? "Charged before dispatch." : ""}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
        <footer className="ops-footer">
          <span>
            <i className={state?.relationships.length ? "" : "muted"} />
            GBrain ·{" "}
            {state?.relationships.length
              ? "recalled relationships"
              : "no relationships yet"}
          </span>
          <span>
            <i className={run?.memory.memorable ? "" : "muted"} />
            Memorable · procedures
          </span>
          <span>
            <i className={run?.decision || forecast?.decision ? "" : "muted"} />
            TypeSafe Jev · decisions
          </span>
          <span>
            Experiment {state?.round || 0} · {state?.relationships.length || 0}{" "}
            remembered factors
          </span>
        </footer>
      </main>
    </div>
  );
}
