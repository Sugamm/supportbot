"use client";

import { formatUsd } from "@/lib/pricing";

export interface ScatterPoint {
  label: string;
  model: string;
  /** USD for one full run of the suite. */
  costPerRun: number;
  /** Accuracy 0-100. */
  accuracy: number;
  color: string;
}

/**
 * Cost on x, accuracy on y. The question is never "which model is best" but
 * "how much accuracy am I buying, and what does it cost per run".
 */
export function ScatterCostQuality({ points }: { points: ScatterPoint[] }) {
  const W = 620;
  const H = 360;
  const PAD = { l: 62, r: 28, t: 24, b: 52 };

  const maxCost = Math.max(...points.map((p) => p.costPerRun), 0.0001) * 1.35;
  const x = (c: number) => PAD.l + (c / maxCost) * (W - PAD.l - PAD.r);
  const y = (a: number) => H - PAD.b - (a / 100) * (H - PAD.t - PAD.b);

  const yTicks = [0, 25, 50, 75, 100];
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxCost);

  return (
    <div className="panel p-5">
      <div className="label mb-1">Cost vs quality</div>
      <p className="mb-3 font-mono text-[11px] text-muted">
        x = cost per full run · y = accuracy. Up and to the left wins.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="cost vs quality">
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(t)}
              y2={y(t)}
              stroke="rgba(255,255,255,.09)"
              strokeDasharray={t === 0 ? "0" : "3 5"}
            />
            <text
              x={PAD.l - 12}
              y={y(t) + 4}
              textAnchor="end"
              className="fill-[#8C8C8C] font-mono"
              fontSize="11"
            >
              {t}%
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text
            key={`x${i}`}
            x={x(t)}
            y={H - PAD.b + 22}
            textAnchor="middle"
            className="fill-[#8C8C8C] font-mono"
            fontSize="11"
          >
            {formatUsd(t)}
          </text>
        ))}
        <line
          x1={PAD.l}
          x2={PAD.l}
          y1={PAD.t}
          y2={H - PAD.b}
          stroke="rgba(255,255,255,.18)"
        />

        {points.map((p) => {
          const cx = x(p.costPerRun);
          const cy = y(p.accuracy);
          // Keep labels inside the plot so a point near $0 does not print over
          // the y-axis ticks.
          const labelX = Math.min(Math.max(cx, PAD.l + 92), W - PAD.r - 92);
          // Points near the top would push their labels off-canvas; flip below.
          const above = cy - 30 > PAD.t;
          const y1 = above ? cy - 30 : cy + 26;
          const y2 = above ? cy - 14 : cy + 42;
          return (
            <g key={p.label}>
              <circle cx={cx} cy={cy} r="20" fill={p.color} opacity="0.16" />
              <circle cx={cx} cy={cy} r="11" fill={p.color} />
              <text
                x={labelX}
                y={y1}
                textAnchor="middle"
                className="fill-white font-mono"
                fontSize="13"
                fontWeight="600"
              >
                {p.label} · {p.accuracy}%
              </text>
              <text
                x={labelX}
                y={y2}
                textAnchor="middle"
                className="fill-[#8C8C8C] font-mono"
                fontSize="10.5"
              >
                {p.model}
              </text>
            </g>
          );
        })}
        <text
          x={(W + PAD.l) / 2}
          y={H - 8}
          textAnchor="middle"
          className="fill-[#8C8C8C] font-mono"
          fontSize="11"
        >
          cost per run (USD)
        </text>
      </svg>
    </div>
  );
}
