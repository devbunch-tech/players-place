import {useMemo, useRef, useState} from 'react';

export interface SparkPoint {
  t: number;
  v: number;
  label: string;
  date: string;
  club?: string;
}

/**
 * Evolução do valor de mercado — linha lima sobre card verde-campo,
 * com crosshair + tooltip no hover (série única, sem legenda; o
 * título do card nomeia a série).
 */
export function Sparkline({points}: {points: SparkPoint[]}) {
  const W = 560;
  const H = 150;
  const PAD_X = 6;
  const PAD_TOP = 12;
  const PAD_BOTTOM = 22;
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const {coords, linePath, areaPath, firstYear, lastYear} = useMemo(() => {
    const ts = points.map((p) => p.t);
    const vs = points.map((p) => p.v);
    const tMin = Math.min(...ts);
    const tMax = Math.max(...ts);
    const vMax = Math.max(...vs);
    const x = (t: number) =>
      PAD_X + ((t - tMin) / Math.max(1, tMax - tMin)) * (W - PAD_X * 2);
    const y = (v: number) =>
      PAD_TOP + (1 - v / Math.max(1, vMax)) * (H - PAD_TOP - PAD_BOTTOM);
    const coords = points.map((p) => ({cx: x(p.t), cy: y(p.v)}));
    const linePath = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`)
      .join(' ');
    const base = H - PAD_BOTTOM;
    const areaPath = `${linePath} L${coords[coords.length - 1].cx.toFixed(1)},${base} L${coords[0].cx.toFixed(1)},${base} Z`;
    return {
      coords,
      linePath,
      areaPath,
      firstYear: new Date(tMin).getFullYear(),
      lastYear: new Date(tMax).getFullYear(),
    };
  }, [points]);

  if (points.length < 2) return null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.cx - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHover(best);
  };

  const h = hover !== null ? points[hover] : null;
  const hc = hover !== null ? coords[hover] : null;
  const last = coords[coords.length - 1];

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-none"
        role="img"
        aria-label={`Evolução do valor de mercado, de ${firstYear} até hoje`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <path d={areaPath} fill="rgba(200,240,75,0.14)" />
        <path
          d={linePath}
          fill="none"
          stroke="#C8F04B"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hc ? (
          <g>
            <line
              x1={hc.cx}
              y1={PAD_TOP}
              x2={hc.cx}
              y2={H - PAD_BOTTOM}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1"
            />
            <circle cx={hc.cx} cy={hc.cy} r="4.5" fill="#C8F04B" stroke="#0E4632" strokeWidth="2" />
          </g>
        ) : (
          <circle cx={last.cx} cy={last.cy} r="4" fill="#C8F04B" />
        )}
        <text x={PAD_X} y={H - 6} fontSize="10" fill="rgba(255,255,255,0.55)">
          {firstYear}
        </text>
        <text x={W - PAD_X} y={H - 6} fontSize="10" fill="rgba(255,255,255,0.55)" textAnchor="end">
          hoje
        </text>
      </svg>
      {h && hc ? (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-center whitespace-nowrap shadow-lg"
          style={{left: `${(hc.cx / W) * 100}%`}}
        >
          <div className="text-[13px] font-bold text-white tabular-nums">{h.label}</div>
          <div className="text-[10px] text-white/60 tabular-nums">
            {h.date}
            {h.club ? ` · ${h.club}` : ''}
          </div>
        </div>
      ) : null}
    </div>
  );
}
