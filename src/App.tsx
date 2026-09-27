import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  GitBranch as GitBranchIcon,
  ArrowRight,
  Check,
  Download,
  LoaderCircle,
  Play,
  RotateCcw,
  Sparkles,
  Undo2,
  UserRoundPlus,
  X,
} from "lucide-react";
import type {
  Integrations,
  RunResult,
  SessionResponse,
  SessionState,
  World,
} from "../shared/types";
import { api } from "./api";
import { Inspector } from "./Inspector";
import { WorldScene } from "./WorldScene";
import { MemoryGraph } from "./MemoryGraph";

const DEFAULT_WORLD: World = {
  packageMass: 2,
  bridgeCapacity: 6,
  bridgeColor: "coral",
};

export default function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [world, setWorld] = useState<World>(DEFAULT_WORLD);
  const [run, setRun] = useState<RunResult | null>(null);
  const [pending, setPending] = useState<
    "loading" | "run" | "teach" | "fresh" | "reset" | null
  >("loading");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [teachOpen, setTeachOpen] = useState(false);
  const [lesson, setLesson] = useState("");
  const [lessonJustSaved, setLessonJustSaved] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const mapElement = useRef<HTMLElement | null>(null);
  const initialRequest = useRef<Promise<SessionResponse> | null>(null);
  const requestVersion = useRef(0);
  const draftVersion = useRef(0);
  const requestBusy = useRef(false);
  const playbackNotice = useRef("");
  const finishPlayback = useCallback(() => {
    setPlaying(false);
    if (playbackNotice.current) {
      setNotice(playbackNotice.current);
      playbackNotice.current = "";
    }
  }, []);
  const applySession = useCallback((response: SessionResponse) => {
    setSession(response.session);
    setIntegrations(response.integrations);
  }, []);

  useEffect(() => {
    let active = true;
    initialRequest.current ??= api.session();
    initialRequest.current
      .then((response) => {
        if (!active) return;
        applySession(response);
        setWorld(response.session.world);
        setPending(null);
      })
      .catch((reason) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not start a new agent.",
        );
        setPending(null);
      });
    return () => {
      active = false;
    };
  }, [applySession]);

  async function runDelivery() {
    if (!session || pending || playing || requestBusy.current) return;
    requestBusy.current = true;
    const version = ++requestVersion.current;
    const draft = draftVersion.current;
    setPending("run");
    setError("");
    setNotice("");
    setTeachOpen(false);
    try {
      const response = await api.run(session.id, world);
      if (version !== requestVersion.current || draft !== draftVersion.current)
        return;
      applySession(response);
      setRun(response.run);
      playbackNotice.current = response.procedure
        ? response.procedure.saved
          ? "This delivery was recorded as a reusable procedure."
          : `The delivery ran. Procedure recording: ${response.procedure.message}`
        : "";
      setPlaying(true);
      setLessonJustSaved(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The delivery could not start.",
      );
    } finally {
      if (version === requestVersion.current) {
        requestBusy.current = false;
        setPending(null);
      }
    }
  }

  async function teach() {
    if (!session || pending || requestBusy.current) return;
    requestBusy.current = true;
    const version = ++requestVersion.current;
    setPending("teach");
    setError("");
    try {
      const response = await api.teach(session.id, lesson);
      if (version !== requestVersion.current) return;
      applySession(response);
      setTeachOpen(false);
      setLessonJustSaved(true);
      setNotice(
        response.recalled
          ? "Lesson saved and recalled. Let’s put it to the test."
          : "Lesson saved. Its next run will check what changed.",
      );
      if (!response.procedure.saved)
        setNotice(`Lesson saved. ${response.procedure.message}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The lesson could not be saved.",
      );
    } finally {
      if (version === requestVersion.current) {
        requestBusy.current = false;
        setPending(null);
      }
    }
  }

  async function freshAgent(reset = false) {
    if (pending || playing || requestBusy.current) return;
    requestBusy.current = true;
    const version = ++requestVersion.current;
    setPending(reset ? "reset" : "fresh");
    setError("");
    setNotice("");
    try {
      const response = reset ? await api.reset() : await api.session();
      if (version !== requestVersion.current) return;
      applySession(response);
      setRun(null);
      setPlaying(false);
      setTeachOpen(false);
      setLessonJustSaved(false);
      if (reset) setWorld(response.session.world);
      const recalled = response.session.rules.some(
        (rule) => rule.source === "gbrain",
      );
      setNotice(
        reset
          ? "Demo lesson cleared. Recorded procedures are kept."
          : recalled
            ? "A fresh agent, with a lesson already remembered."
            : "A fresh agent. Start with a delivery.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create an agent.",
      );
    } finally {
      if (version === requestVersion.current) {
        requestBusy.current = false;
        setPending(null);
      }
    }
  }

  function updateDraft(nextWorld: World) {
    if (pending || playing || requestBusy.current) return;
    draftVersion.current += 1;
    setWorld(nextWorld);
  }

  const learned = Boolean(
    session?.rules.some((rule) => rule.source === "gbrain"),
  );
  const draftChanged = Boolean(
    run &&
      (run.world.packageMass !== world.packageMass ||
        run.world.bridgeCapacity !== world.bridgeCapacity ||
        run.world.bridgeColor !== world.bridgeColor),
  );
  const canTeach =
    run?.outcome === "fell" && !playing && !lessonJustSaved && !draftChanged;
  const locked = Boolean(pending || playing);
  let ghostRun: RunResult | null = null;
  if (session && run?.outcome !== "fell") {
    for (let index = session.history.length - 1; index >= 0; index -= 1) {
      if (session.history[index].outcome === "fell") {
        ghostRun = session.history[index];
        break;
      }
    }
  }
  const noFreshChecks = Boolean(
    run && run.checks.every((check) => check.status === "reused"),
  );
  const colorOnlyRun = Boolean(
    run &&
      run.plan.changedFields.length === 1 &&
      run.plan.changedFields[0] === "bridgeColor" &&
      noFreshChecks,
  );
  const firstDeliveryWithLesson = Boolean(
    run &&
      session?.history.length === 1 &&
      run.memoryUsed.some((rule) => rule.source === "gbrain"),
  );
  const title =
    draftChanged && !playing
      ? "A change worth a fresh look."
      : playing
        ? run?.route === "detour"
          ? "A longer way. A better ending."
          : run?.outcome === "fell"
            ? "Something doesn’t add up…"
            : "A little delivery in progress."
        : run?.outcome === "fell"
          ? "Oops. That was a heavy lesson."
          : run?.outcome === "stopped"
            ? "A careful pause before crossing."
            : run?.outcome === "delivered"
              ? colorOnlyRun
                ? "Fresh coat. Same safe route."
                : firstDeliveryWithLesson
                  ? "First try. Lesson already learned."
                  : run.route === "detour"
                    ? noFreshChecks
                      ? "A familiar route. Still a safe delivery."
                      : "Same parcel. Smarter journey."
                    : "A safe arrival. A good start."
              : learned
                ? "New robot. Not starting from zero."
                : "Every good lesson starts somewhere.";
  const description =
    draftChanged && !playing
      ? `Draft settings: ${world.packageMass} kg parcel, ${world.bridgeCapacity} kg bridge. Run a delivery to see what happens.`
      : playing
        ? "Watch the path. The checks on the right explain its choice."
        : run?.outcome === "fell"
          ? "It trusted an old load check. Teach it which change deserved a fresh look."
          : run?.outcome === "stopped"
            ? run.explanation
            : run?.outcome === "delivered"
              ? colorOnlyRun || (run.route === "detour" && noFreshChecks)
                ? "The earlier load check still applies. Same safe route, no new checks."
                : firstDeliveryWithLesson
                  ? "It retrieved the weight lesson before its first delivery and chose a safe path."
                  : run.route === "detour"
                    ? "This time, it checked the weight and carried the parcel around."
                    : "Now make the parcel heavier than the bridge limit, and try again."
              : learned
                ? "Change the weight, capacity, or color. See when the lesson actually applies."
                : "Run a delivery, then make the parcel heavier. Your robot has a little growing to do.";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Impactor home">
          <span className="brand-mark">✳</span>Impactor
          <span className="brand-period">.</span>
        </a>
        <div className="header-right">
          <span>A little wiser, every time.</span>
          <a
            className={`icon-button export-button ${!session ? "disabled" : ""}`}
            href={
              session
                ? `/api/export?sessionId=${encodeURIComponent(session.id)}`
                : "#"
            }
            aria-label="Export lesson and evidence"
            title="Export lesson and evidence"
            download
          >
            <Download size={18} />
          </a>
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <h1 aria-label="Small robot. Big lessons.">
              Small robot.
              <br />
              <span>Big lessons.</span>
            </h1>
            <p>One delivery. One mistake. A better way next time.</p>
          </div>
          <div className="intro-side">
            <div className="little-orbit">
              <Sparkles size={20} />
            </div>
            <p>
              Learning you can <em>see.</em>
            </p>
          </div>
        </div>
        <AnimatePresence>
          {error && (
            <motion.div
              role="alert"
              className="error-notice"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={17} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="workspace">
          <section className="scene-panel" aria-label="Delivery simulation">
            <WorldScene
              world={run && playing ? run.world : world}
              run={draftChanged && !playing ? null : run}
              playing={playing}
              onFinished={finishPlayback}
              agentName={session?.agentName || ""}
              remembered={learned}
              ghostRun={ghostRun}
            />
            <div className="scene-toolbar">
              <div className="primary-actions">
                <button
                  className="button button-primary"
                  onClick={runDelivery}
                  disabled={locked || !session}
                >
                  {pending === "run" || pending === "loading" ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                  {pending === "loading"
                    ? "Waking up…"
                    : pending === "run"
                      ? "Choosing a path…"
                      : playing
                        ? "On its way…"
                        : lessonJustSaved
                          ? "Try that again"
                          : "Run delivery"}
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => freshAgent()}
                  disabled={locked}
                >
                  {pending === "fresh" ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <UserRoundPlus size={17} />
                  )}
                  Fresh agent
                </button>
                <button
                  className="quiet-button reset-button"
                  onClick={() => freshAgent(true)}
                  disabled={locked || !session}
                  title="Reset this demo and its learned rules"
                >
                  <RotateCcw size={14} />
                  <span>Reset</span>
                </button>
              </div>
              <div className={`run-indicator ${playing ? "running" : ""}`}>
                <i />
                {playing
                  ? "Making its way"
                  : session
                    ? "Ready when you are"
                    : "Connecting"}
              </div>
            </div>
            <div
              className={`outcome-strip ${!draftChanged && !playing && run?.outcome === "fell" ? "outcome-fell" : !draftChanged && !playing && run?.outcome === "delivered" ? "outcome-delivered" : ""}`}
              aria-live="polite"
            >
              <div className="outcome-icon">
                {!draftChanged && !playing && run?.outcome === "fell" ? (
                  <Undo2 size={21} />
                ) : !draftChanged &&
                  !playing &&
                  run?.outcome === "delivered" ? (
                  <Check size={22} />
                ) : (
                  <Sparkles size={21} />
                )}
              </div>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
              {canTeach && (
                <button
                  className="teach-button"
                  onClick={() => setTeachOpen(true)}
                  disabled={Boolean(pending)}
                >
                  <Sparkles size={16} />
                  Teach a lesson
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </section>
          <Inspector
            world={world}
            onWorldChange={updateDraft}
            session={session}
            run={run}
            integrations={integrations}
            disabled={locked}
            onMapToggle={(open) => {
              setMapOpen(open);
              if (open)
                window.setTimeout(
                  () =>
                    mapElement.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "nearest",
                    }),
                  80,
                );
            }}
          />
        </div>
        <AnimatePresence>
          {mapOpen && (
            <motion.section
              ref={mapElement}
              className="expanded-memory"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="map-heading">
                <div>
                  <h2>How a lesson changes the journey.</h2>
                  <p>
                    Click a step to inspect the actual memory, checks, and
                    evidence.
                  </p>
                </div>
                <GitBranchIcon />
              </div>
              <MemoryGraph
                run={run}
                session={session}
                draftChanged={draftChanged}
              />
            </motion.section>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {notice && (
            <motion.div
              className="success-notice"
              role="status"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Sparkles size={15} />
              <span>{notice}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <footer className="how-it-works">
          <div>
            <span className="step-number">01</span>
            <p>
              <strong>Try a little.</strong>
              <span>Let it make its first delivery.</span>
            </p>
          </div>
          <div>
            <span className="step-number">02</span>
            <p>
              <strong>Learn a little.</strong>
              <span>A mistake becomes a useful lesson.</span>
            </p>
          </div>
          <div>
            <span className="step-number">03</span>
            <p>
              <strong>Carry it forward.</strong>
              <span>A fresh agent remembers what mattered.</span>
            </p>
          </div>
          <span className="footer-flower">✳</span>
        </footer>
      </main>
      <AnimatePresence>
        {teachOpen && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !pending && setTeachOpen(false)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="teach-title"
              className="teach-dialog"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12 }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                className="dialog-close icon-button"
                aria-label="Close lesson"
                onClick={() => setTeachOpen(false)}
                disabled={Boolean(pending)}
              >
                <X size={18} />
              </button>
              <div className="teach-illustration">
                <img
                  src="/robot.png"
                  alt="Your delivery robot, ready for a second chance"
                />
                <span>Ohh. I see.</span>
              </div>
              <h2 id="teach-title">A mistake worth remembering.</h2>
              <p>
                The parcel got heavier. The robot reused an old check. This
                fixed lesson reconnects the change to the check it needs.
              </p>
              <div className="canonical-lesson">
                <span>Parcel weight changes</span>
                <ArrowRight size={15} />
                <strong>Recheck bridge load</strong>
              </div>
              <label htmlFor="lesson-text">Your note (optional)</label>
              <textarea
                id="lesson-text"
                value={lesson}
                onChange={(event) => setLesson(event.target.value)}
                rows={3}
                maxLength={350}
                placeholder="What would you like this little robot to remember about the mistake?"
                autoFocus
                disabled={Boolean(pending)}
              />
              <div className="lesson-proof">
                <span>{run?.environment.actualLoad} kg parcel</span>
                <ArrowRight size={14} />
                <span>{run?.environment.capacity} kg bridge</span>
                <strong>Too heavy to cross</strong>
              </div>
              <button
                className="button button-primary save-lesson"
                onClick={teach}
                disabled={Boolean(pending)}
              >
                {pending === "teach" ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Sparkles size={17} />
                )}
                {pending === "teach"
                  ? "Saving and checking memory…"
                  : "Save this lesson"}
              </button>
              <small>
                The next run will retrieve the lesson before choosing its
                checks.
              </small>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
