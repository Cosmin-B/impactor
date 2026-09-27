import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { RunResult, World } from "../shared/types";

const PALETTE = {
  coral: { light: "#ff977d", main: "#ef785e", dark: "#c35d47" },
  teal: { light: "#8fd2c2", main: "#55ad9b", dark: "#387f72" },
  gold: { light: "#ffd370", main: "#e7ad38", dark: "#b88829" },
};
const TREES = [
  [73, 97, 1.1],
  [237, 32, 0.9],
  [319, 123, 0.75],
  [391, 50, 0.7],
  [742, 69, 0.78],
  [793, 91, 0.65],
  [972, 174, 0.7],
  [948, 509, 1.2],
  [819, 527, 0.85],
  [88, 486, 1.14],
  [64, 353, 0.75],
  [279, 500, 0.75],
  [314, 352, 0.83],
  [722, 339, 0.87],
  [657, 91, 0.55],
  [363, 513, 0.48],
] as const;
const GRASS = [
  [157, 56],
  [350, 72],
  [383, 180],
  [56, 191],
  [200, 144],
  [289, 205],
  [725, 181],
  [815, 132],
  [959, 64],
  [663, 264],
  [964, 380],
  [776, 455],
  [330, 450],
  [137, 393],
  [226, 349],
  [380, 304],
] as const;
const DIRECT_X = [142, 259, 394, 492, 604, 750, 872];
const DIRECT_Y = [252, 257, 272, 272, 272, 255, 242];
const DETOUR_X = [142, 224, 256, 326, 428, 513, 620, 735, 813, 872];
const DETOUR_Y = [252, 280, 379, 424, 425, 419, 435, 444, 360, 242];

function Tree({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cy="28" rx="38" ry="12" fill="#5b8552" opacity=".16" />
      <path d="M-5 0 L-5 30 Q0 34 7 29 L6 0" fill="#93714c" />
      <path
        d="M0 13 L-13 1 M2 19 L15 3"
        stroke="#745638"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <ellipse cx="3" cy="-8" rx="33" ry="38" fill="url(#leaf)" />
      <circle cx="-22" cy="3" r="21" fill="#4f926b" />
      <circle cx="24" cy="3" r="22" fill="#3d805d" />
      <circle cx="-6" cy="-22" r="24" fill="#67a775" />
      <path
        d="M-20 -19 Q-11 -32 1 -31"
        fill="none"
        stroke="#8cbd82"
        strokeWidth="5"
        opacity=".45"
        strokeLinecap="round"
      />
    </g>
  );
}

function Sign({
  x,
  y,
  text,
  width = 94,
}: {
  x: number;
  y: number;
  text: string;
  width?: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-3 18 L-3 41 Q0 44 4 41 L4 18" fill="#a58b59" />
      <rect
        x={-width / 2}
        y="-10"
        width={width}
        height="33"
        rx="5"
        fill="#a78d60"
        opacity=".17"
        transform="translate(2 4)"
      />
      <rect
        x={-width / 2}
        y="-10"
        width={width}
        height="33"
        rx="5"
        fill="#ffe6aa"
        stroke="#dabb82"
        strokeWidth="1.5"
      />
      <path
        d={`M${-width / 2 + 7} -5 H${width / 2 - 7}`}
        stroke="#fff2ce"
        strokeWidth="2"
      />
      <text
        y="11"
        textAnchor="middle"
        fill="#514433"
        fontSize="14"
        fontWeight="650"
      >
        {text}
      </text>
    </g>
  );
}

function Cottage() {
  return (
    <g transform="translate(844 142)">
      <ellipse cx="40" cy="101" rx="74" ry="20" fill="#4e784c" opacity=".14" />
      <path d="M-12 34 L40 4 L105 35 V95 L40 114 L-12 88Z" fill="#f5f1e3" />
      <path d="M40 42 L105 25 V95 L40 114Z" fill="#e4dfcc" />
      <path d="M-29 35 L24 -16 L116 11 L55 50Z" fill="#fc8a6c" />
      <path d="M55 50 L116 11 L120 21 L55 61 L-31 46 L-29 35Z" fill="#dd6e55" />
      <path
        d="M-9 39 L40 -10 M13 44 L63 -3 M36 49 L85 3"
        stroke="#e17457"
        strokeWidth="2"
      />
      <rect x="5" y="65" width="23" height="32" rx="6" fill="#e67b60" />
      <circle cx="23" cy="82" r="2" fill="#ffd49d" />
      <path d="M-4 63 V53 Q3 42 11 50 V66Z" fill="#6c9a9c" />
      <path d="M66 62 V49 Q77 38 84 43 V59Z" fill="#739b9b" />
      <path
        d="M31 -8 V-55"
        stroke="#636b61"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M33 -54 Q49 -63 66 -51 V-26 Q48 -38 33 -29Z" fill="#fc8a6c" />
      <path
        d="M49 -50 L51 -45 L56 -44 L52 -40 L53 -35 L48 -38 L44 -35 L44 -41 L41 -44 L46 -45Z"
        fill="#fff7e5"
      />
    </g>
  );
}

export function WorldScene({
  world,
  run,
  playing,
  onFinished,
  agentName,
  remembered,
  ghostRun,
}: {
  world: World;
  run: RunResult | null;
  playing: boolean;
  onFinished: () => void;
  agentName: string;
  remembered: boolean;
  ghostRun: RunResult | null;
}) {
  const reducedMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const [arrived, setArrived] = useState(false);
  const color = PALETTE[world.bridgeColor];
  const duration = reducedMotion
    ? 0.35
    : run?.route === "detour"
      ? 7
      : run?.outcome === "fell"
        ? 4.2
        : 5.2;
  useEffect(() => {
    if (!run) {
      setCollapsed(false);
      setArrived(false);
      return;
    }
    if (!playing) return;
    setCollapsed(false);
    setArrived(false);
    const collapseTimer = window.setTimeout(
      () => {
        if (run.outcome === "fell") setCollapsed(true);
      },
      reducedMotion ? 100 : 2450,
    );
    const finishTimer = window.setTimeout(
      () => {
        setArrived(run.outcome === "delivered");
        onFinished();
      },
      duration * 1000 + 500,
    );
    return () => {
      window.clearTimeout(collapseTimer);
      window.clearTimeout(finishTimer);
    };
  }, [run?.id, playing, duration, reducedMotion, onFinished]);

  const failed = run?.outcome === "fell";
  const x =
    run?.route === "stop"
      ? [142, 259, 370]
      : run?.route === "detour"
        ? DETOUR_X
        : failed
          ? [142, 262, 400, 492, 505, 510]
          : DIRECT_X;
  const y =
    run?.route === "stop"
      ? [252, 257, 272]
      : run?.route === "detour"
        ? DETOUR_Y
        : failed
          ? [252, 260, 272, 272, 332, 377]
          : DIRECT_Y;
  const activeRun = Boolean(run);
  const endX = activeRun ? x[x.length - 1] : 142;
  const endY = activeRun ? y[y.length - 1] : 252;
  return (
    <div className={`world-wrap ${collapsed ? "world-fell" : ""}`}>
      <div className="scene-topline">
        <span>
          <span className="tiny-sun" />
          The river crossing
        </span>
        <span className="agent-label">
          <i className={remembered ? "is-wise" : ""} />
          {agentName || "Your little explorer"}
        </span>
      </div>
      <svg
        className="world-svg"
        viewBox="0 0 1040 560"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label={`A delivery robot crossing a river. Parcel ${world.packageMass} kilograms, bridge capacity ${world.bridgeCapacity} kilograms.${run ? ` Last result: ${run.outcome}.` : ""}`}
      >
        <defs>
          <linearGradient id="grass" x2=".8" y2="1">
            <stop stopColor="#cee1b4" />
            <stop offset="1" stopColor="#b9d597" />
          </linearGradient>
          <linearGradient id="water" x2="1" y2=".3">
            <stop stopColor="#74c8dc" />
            <stop offset=".5" stopColor="#80d3e4" />
            <stop offset="1" stopColor="#63bad3" />
          </linearGradient>
          <linearGradient id="leaf" x2=".8" y2="1">
            <stop stopColor="#6ba675" />
            <stop offset="1" stopColor="#377653" />
          </linearGradient>
          <filter id="soft-shadow" x="-30%" width="160%" y="-30%" height="170%">
            <feDropShadow
              dx="0"
              dy="5"
              stdDeviation="3"
              floodColor="#214936"
              floodOpacity=".13"
            />
          </filter>
          <pattern
            id="water-lines"
            width="100"
            height="93"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M12 38 Q23 32 33 37 T54 36 M63 82 Q70 78 81 82"
              fill="none"
              stroke="#c2e9ed"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity=".5"
            />
          </pattern>
        </defs>
        <rect width="1040" height="560" fill="url(#grass)" />
        <path
          d="M-20 230 C90 215 175 255 273 257 S385 289 445 273 M562 273 C720 287 776 229 890 243"
          fill="none"
          stroke="#e9d0a6"
          strokeWidth="37"
        />
        <path
          d="M210 262 C233 285 238 390 298 416 S405 432 451 422 M570 426 C624 438 722 475 781 420 S814 300 877 249"
          fill="none"
          stroke="#ead2ad"
          strokeWidth="28"
        />
        <path
          d="M-20 230 C90 215 175 255 273 257 S385 289 445 273 M562 273 C720 287 776 229 890 243"
          fill="none"
          stroke="#f3dfbf"
          strokeWidth="27"
        />
        <path
          d="M210 262 C233 285 238 390 298 416 S405 432 451 422 M570 426 C624 438 722 475 781 420 S814 300 877 249"
          fill="none"
          stroke="#f4e3c9"
          strokeWidth="20"
        />
        <path
          d="M447 -20 C466 61 415 112 444 175 S465 265 444 324 S463 430 442 482 S450 535 443 590 L592 590 C565 524 585 476 575 420 S601 321 586 266 S594 181 585 127 S603 47 596 -20Z"
          fill="#e9d4a4"
        />
        <path
          d="M459 -20 C480 62 435 111 457 176 S480 265 458 324 S480 430 457 482 S468 540 457 590 L577 590 C550 524 571 476 560 420 S586 321 572 266 S579 181 572 127 S590 47 582 -20Z"
          fill="url(#water)"
        />
        <path
          className="water-shimmer"
          d="M479 -20 C500 81 452 119 483 189 S496 284 477 354 S498 466 478 584"
          fill="none"
          stroke="#a5e1e8"
          strokeWidth="28"
          opacity=".3"
        />
        <path
          d="M468 0 C480 62 435 111 457 176 S480 265 458 324 S480 430 457 482 S468 540 457 560 L577 560 C550 524 571 476 560 420 S586 321 572 266 S579 181 572 127 S590 47 582 0Z"
          fill="url(#water-lines)"
        />
        {GRASS.map(([gx, gy], i) => (
          <g
            key={i}
            transform={`translate(${gx} ${gy})`}
            opacity=".45"
            fill="#7daa6a"
          >
            <ellipse cy="-5" rx="2.5" ry="7" transform="rotate(-25)" />
            <ellipse cx="7" cy="-5" rx="2.5" ry="7" transform="rotate(15)" />
          </g>
        ))}
        {[
          [347, 151],
          [139, 346],
          [747, 236],
          [943, 298],
          [178, 483],
          [817, 90],
        ].map(([fx, fy], i) => (
          <g key={i} transform={`translate(${fx} ${fy})`}>
            <circle cx="-3" r="3.5" fill="#fff9e9" />
            <circle cx="3" r="3.5" fill="#fff9e9" />
            <circle cy="-4" r="3.5" fill="#fff9e9" />
            <circle cy="4" r="3.5" fill="#fff9e9" />
            <circle r="2" fill="#edc759" />
          </g>
        ))}
        <g fill="#93a587" opacity=".9">
          <path d="M606 105 L618 96 L633 105 L638 119 L618 126 L600 117Z" />
          <path d="M825 390 L840 372 L865 387 L870 410 L839 421 L816 411Z" />
          <path d="M331 473 L340 458 L360 460 L371 475 L362 486 L337 486Z" />
        </g>
        {TREES.map(([tx, ty, ts], i) => (
          <Tree key={i} x={tx} y={ty} scale={ts} />
        ))}
        <path
          d="M220 289 C237 328 244 388 298 417 S405 432 451 422 M575 427 C636 444 722 466 777 419 S814 300 865 261"
          fill="none"
          stroke="#fffaf0"
          strokeWidth="4"
          strokeDasharray="5 10"
          strokeLinecap="round"
        />
        <path
          d="M580 273 C708 277 774 246 846 251"
          fill="none"
          stroke="#fffaf0"
          strokeWidth="4"
          strokeDasharray="5 10"
          strokeLinecap="round"
        />
        <g transform="translate(415 402)" filter="url(#soft-shadow)">
          <path d="M0 22 Q97 -28 193 22 V48 Q96 10 0 49Z" fill="#9ba5a2" />
          <path
            d="M0 12 Q97 -35 193 12 V26 Q96 -12 0 28Z"
            fill="#c1c6ba"
            stroke="#909d95"
            strokeWidth="2"
          />
          {[20, 48, 77, 108, 137, 166].map((v) => (
            <path
              key={v}
              d={`M${v} ${v < 40 || v > 150 ? 8 : 0} V${v < 40 || v > 150 ? 23 : 15}`}
              stroke="#929e96"
              strokeWidth="3"
            />
          ))}
          <path
            d="M1 40 Q97 -1 192 40"
            fill="none"
            stroke="#e2e1cd"
            strokeWidth="5"
          />
        </g>
        <g filter="url(#soft-shadow)">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
            <motion.g
              key={`${world.bridgeColor}-${i}`}
              animate={
                collapsed
                  ? {
                      y: 42 + Math.sin(i * 3) * 18,
                      rotate: (i % 2 ? 1 : -1) * (10 + i * 2),
                      opacity: 0.75,
                    }
                  : { y: 0, rotate: 0, opacity: 1 }
              }
              transition={{
                duration: 0.55,
                delay: collapsed ? Math.abs(i - 5) * 0.02 : 0,
              }}
              style={{ transformOrigin: `${412 + i * 17}px 269px` }}
            >
              <rect
                x={412 + i * 17}
                y="250"
                width="17"
                height="48"
                rx="2"
                fill={i % 2 ? color.main : color.light}
                stroke={color.dark}
                strokeWidth=".8"
              />
              <path
                d={`M${418 + i * 17} 255 V288`}
                stroke="#fff5d8"
                strokeWidth="1"
                opacity=".3"
              />
            </motion.g>
          ))}
          {[411, 617].map((bx) => (
            <g key={bx}>
              <rect
                x={bx - 6}
                y="232"
                width="14"
                height="72"
                rx="5"
                fill={color.dark}
              />
              <ellipse cx={bx + 1} cy="232" rx="8" ry="4" fill={color.light} />
            </g>
          ))}
          <motion.g animate={{ opacity: collapsed ? 0.15 : 1 }}>
            <path
              d="M412 245H617 M412 298H617"
              stroke={color.dark}
              strokeWidth="5"
            />
            <path d="M412 241H617" stroke={color.light} strokeWidth="4" />
          </motion.g>
        </g>
        <Cottage />
        <Sign x={188} y={190} text="Start" width={64} />
        <Sign x={927} y={273} text="Delivery" width={92} />
        <Sign x={690} y={396} text="Safe detour" width={116} />
        <g transform="translate(515 209)">
          <rect
            x="-73"
            y="-24"
            width="146"
            height="32"
            rx="9"
            fill="#fff8e3"
            filter="url(#soft-shadow)"
          />
          <text
            y="-3"
            textAnchor="middle"
            fill="#425044"
            fontSize="15"
            fontWeight="650"
          >
            Bridge · {world.bridgeCapacity} kg
          </text>
        </g>
        {ghostRun && (
          <motion.g
            key={`ghost-${run?.id || "ready"}`}
            className="ghost-robot"
            initial={{ x: 142, y: 252, opacity: 0.34 }}
            animate={
              playing
                ? {
                    x: [142, 262, 400, 492, 505, 510],
                    y: [252, 260, 272, 272, 332, 377],
                    rotate: [0, 0, 0, -9, 16, -12],
                    opacity: [0.3, 0.3, 0.34, 0.38, 0.3, 0.18],
                  }
                : { x: 510, y: 377, rotate: -12, opacity: 0.2 }
            }
            transition={{
              duration: playing ? (reducedMotion ? 0.2 : 4.2) : 0.2,
              delay: playing ? 0.2 : 0,
              ease: "linear",
            }}
          >
            <image href="/robot.png" x="-43" y="-111" width="94" height="119" />
            <circle
              cy="9"
              r="20"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeDasharray="3 4"
            />
            <g className="ghost-caption" transform="translate(0 -124)">
              <rect
                x="-66"
                y="-18"
                width="132"
                height="26"
                rx="9"
                fill="#fffef3"
              />
              <text
                textAnchor="middle"
                y="0"
                fontSize="10"
                fill="#557258"
                fontWeight="600"
              >
                {ghostRun.world.packageMass !== world.packageMass ||
                ghostRun.world.bridgeCapacity !== world.bridgeCapacity ||
                ghostRun.world.bridgeColor !== world.bridgeColor
                  ? "Previous · different world"
                  : "Previous attempt"}
              </text>
            </g>
          </motion.g>
        )}
        {collapsed && (
          <g className="splash" transform="translate(510 365)">
            <ellipse rx="40" ry="10" fill="#d5f5f6" opacity=".7" />
            <path
              d="M-25 0 Q-34 -40 -39 -24 M27 1 Q41 -34 45 -16 M-4 -3 Q-2 -42 3 -30"
              fill="none"
              stroke="#d5f5f6"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </g>
        )}
        <motion.g
          key={run?.id || agentName}
          initial={{ x: 142, y: 252 }}
          animate={
            playing
              ? { x, y, rotate: failed ? [0, 0, 0, -9, 16, -12] : 0 }
              : { x: endX, y: endY, rotate: failed ? -12 : 0 }
          }
          transition={{
            duration: playing ? duration : 0.3,
            ease: "linear",
            delay: playing ? 0.2 : 0,
          }}
        >
          <ellipse
            cy="7"
            rx="25"
            ry="7"
            fill="#365d43"
            opacity={collapsed ? 0.05 : 0.18}
          />
          <motion.g
            animate={playing && !reducedMotion ? { y: [0, -3, 0] } : { y: 0 }}
            transition={{ duration: 0.38, repeat: playing ? Infinity : 0 }}
          >
            <image href="/robot.png" x="-43" y="-111" width="94" height="119" />
          </motion.g>
          {!playing && !run && (
            <g className="robot-speech" transform="translate(22 -119)">
              <rect
                x="-19"
                y="-28"
                width="55"
                height="27"
                rx="12"
                fill="#fffdf4"
              />
              <path d="M-2 -2 L4 6 L9 -2" fill="#fffdf4" />
              <text
                x="8"
                y="-10"
                textAnchor="middle"
                fontSize="12"
                fontWeight="650"
                fill="#657060"
              >
                Let's go!
              </text>
            </g>
          )}
        </motion.g>
        {arrived && (
          <motion.g
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <g transform="translate(872 111)">
              <rect
                x="-53"
                y="-30"
                width="106"
                height="30"
                rx="15"
                fill="#fffdf2"
              />
              <text
                textAnchor="middle"
                y="-10"
                fontSize="14"
                fill="#3a785b"
                fontWeight="700"
              >
                Delivered ✓
              </text>
            </g>
          </motion.g>
        )}
      </svg>
      <div className="scene-bottomline">
        <span className="world-coordinate">
          A tiny world. Real consequences.
        </span>
        <span className="parcel-label">
          <span className="parcel-dot" />
          {world.packageMass} kg parcel
        </span>
      </div>
    </div>
  );
}
