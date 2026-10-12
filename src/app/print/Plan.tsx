import { obbCorners, roomWalls, type Design, type SceneModel } from '../../core';

/** The room from above with every entity's footprint, openings and wall numbers. */
export function Plan({ design, scene }: { design: Design; scene: SceneModel }) {
  const cs = design.room.corners;
  const xs = cs.map((c) => c.x);
  const zs = cs.map((c) => c.z);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const size = Math.max(x1 - x0, z1 - z0);
  const pad = size * 0.08;
  const font = size / 45;
  const walls = roomWalls(design.room);
  return (
    <figure className="drawing">
      <svg
        viewBox={`${x0 - pad} ${z0 - pad} ${x1 - x0 + pad * 2} ${z1 - z0 + pad * 2}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Plan"
      >
        <rect x={x0 - pad} y={z0 - pad} width={x1 - x0 + pad * 2} height={z1 - z0 + pad * 2} fill="#fff" />
        <polygon
          points={cs.map((c) => `${c.x},${c.z}`).join(' ')}
          fill="#faf8f3"
          stroke="#222"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        {design.room.obstacles.map((o) => (
          <rect
            key={o.id}
            x={o.min.x}
            y={o.min.z}
            width={o.max.x - o.min.x}
            height={o.max.z - o.min.z}
            fill="#d8d5cf"
            stroke="#777"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {design.room.openings.map((o) => {
          const w = walls.find((x) => x.key === o.wall);
          if (!w) return null;
          const t0 = o.offset / w.length;
          const t1 = (o.offset + o.width) / w.length;
          return (
            <line
              key={o.id}
              x1={w.a.x + (w.b.x - w.a.x) * t0}
              y1={w.a.z + (w.b.z - w.a.z) * t0}
              x2={w.a.x + (w.b.x - w.a.x) * t1}
              y2={w.a.z + (w.b.z - w.a.z) * t1}
              stroke="#4a8bd6"
              strokeWidth={5}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {[...scene.entities.values()].map((se) => {
          const pts = obbCorners(se.bounds);
          const e = design.entities[se.id];
          return (
            <g key={se.id}>
              <polygon
                points={pts.map((p) => `${p.x},${p.z}`).join(' ')}
                fill="#ebe6db"
                stroke="#3d3f44"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={se.bounds.center.x}
                y={se.bounds.center.z}
                fontSize={font}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#222"
              >
                {e?.name}
              </text>
            </g>
          );
        })}
        {walls.map((w) => (
          <text
            key={w.key}
            x={(w.a.x + w.b.x) / 2 - w.inward.x * font * 1.6}
            y={(w.a.z + w.b.z) / 2 - w.inward.z * font * 1.6}
            fontSize={font}
            textAnchor={w.inward.x < -0.5 ? 'start' : w.inward.x > 0.5 ? 'end' : 'middle'}
            dominantBaseline="middle"
            fill="#555"
          >
            {w.index} · {Math.round(w.length)}
          </text>
        ))}
      </svg>
      <figcaption>Plan (walls numbered, lengths in mm)</figcaption>
    </figure>
  );
}
