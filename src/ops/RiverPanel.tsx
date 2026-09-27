import type { OpsRun } from "../../shared/ops/types";
import result from "../../shared/ops/river-training.json";
interface Evaluation {
  correct: number;
  total: number;
  rows: Array<{ expected: string; generated: string }>;
}
const report = result as {
  status: string;
  baseModel: string;
  trainCount: number;
  heldoutCount: number;
  steps: Array<{ step: number; loss: number }>;
  before?: Evaluation;
  after?: Evaluation;
  elapsedSeconds: number | null;
  method: string;
  task: string;
  limitations: string;
};
export function RiverPanel({
  run,
  onUse,
}: {
  run?: OpsRun | null;
  onUse: () => void;
}) {
  const max = Math.max(1, ...report.steps.map((s) => s.loss));
  return (
    <div className="river-panel">
      <div>
        <p className="eyebrow">River post-training and dispatch</p>
        <button className="ops-btn primary" onClick={onUse}>
          Use trained River controller
        </button>
        <p>
          {run?.controller === "river"
            ? `${run.decisions?.length || 0} actual River decisions applied in the last shift. ${run.plan.delivered}/6 delivered, ${run.plan.onTime} on time.`
            : "Select the trained controller, then Run the shift. The saved River checkpoint chooses normal, charge or detour after each simulated preflight."}
        </p>
        <h3>A policy trained from simulated corrections</h3>
        <p>{report.task}</p>
        <dl>
          <div>
            <dt>Base model</dt>
            <dd>{report.baseModel}</dd>
          </div>
          <div>
            <dt>Training examples</dt>
            <dd>{report.trainCount}</dd>
          </div>
          <div>
            <dt>Held-out examples</dt>
            <dd>{report.heldoutCount}</dd>
          </div>
          <div>
            <dt>Completed steps</dt>
            <dd>{report.steps.length}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {report.status}
              {report.elapsedSeconds
                ? ` in ${report.elapsedSeconds} seconds`
                : ""}
            </dd>
          </div>
        </dl>
        <p>{report.limitations}</p>
      </div>
      <div>
        <h3>Measured training loss</h3>
        <svg
          viewBox="0 0 540 180"
          role="img"
          aria-label={`Training loss across ${report.steps.length} completed steps`}
        >
          <path d="M35 15V145H520" fill="none" stroke="#bac7bc" />
          {report.steps.map((s, i) => {
            const x = 45 + (i * 450) / Math.max(1, report.steps.length - 1),
              y = 140 - (s.loss / max) * 110;
            return (
              <g key={s.step}>
                {i > 0 && (
                  <line
                    x1={
                      45 +
                      ((i - 1) * 450) / Math.max(1, report.steps.length - 1)
                    }
                    y1={140 - (report.steps[i - 1].loss / max) * 110}
                    x2={x}
                    y2={y}
                    stroke="#ce755c"
                    strokeWidth="3"
                  />
                )}
                <circle cx={x} cy={y} r="4" fill="#ce755c" />
                <text x={x} y="166" textAnchor="middle">
                  {s.step}
                </text>
                {(i === 0 || i === report.steps.length - 1) && (
                  <text x={x} y={y - 12} textAnchor="middle">
                    {s.loss < 0.001
                      ? s.loss.toExponential(1)
                      : s.loss.toFixed(3)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <p>{report.method}</p>
        <div className="river-score">
          <strong>
            Exact action matches before:{" "}
            {report.before
              ? `${report.before.correct}/${report.before.total}`
              : "pending"}
          </strong>
          <strong>
            Exact action matches after:{" "}
            {report.after
              ? `${report.after.correct}/${report.after.total}`
              : "pending"}
          </strong>
        </div>
        {report.after && (
          <div className="river-rows">
            <div>
              <b>Expected action</b>
              <b>Base response</b>
              <b>Trained response</b>
            </div>
            {report.after.rows.map((r, i) => (
              <div key={i}>
                <span>{r.expected}</span>
                <span>
                  {report.before?.rows[i]?.generated || "(empty response)"}
                </span>
                <span>{r.generated || "(empty response)"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
