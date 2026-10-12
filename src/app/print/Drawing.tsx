import type { Elevation, Rect } from '../../core';

const FILL: Partial<Record<Rect['role'], string>> = {
  carcass: '#f6f4ee',
  back: '#e6e3dc',
  divider: '#f1eee7',
  shelf: '#f1eee7',
  front: '#ebe6db',
  'drawer-box': '#efebe3',
  rail: '#b9bcc2',
  handle: '#6b6e74',
  hardware: '#9a9da3',
  trim: '#e2ded5',
  invalid: '#f6c8c9',
  opening: '#dcebf7',
  wall: '#f7f6f2',
};

/** A dimensioned elevation drawing in millimetres (y up). */
export function Drawing(props: { title: string; elevation: Elevation; width?: number; height?: number; id?: string }) {
  const { rects, bounds } = props.elevation;
  const w = Math.max(1, bounds.x1 - bounds.x0);
  const h = Math.max(1, bounds.y1 - bounds.y0);
  const pad = Math.max(w, h) * 0.12;
  const font = Math.max(w, h) / 28;
  const vb = `${bounds.x0 - pad} ${-bounds.y1 - pad} ${w + pad * 2} ${h + pad * 2}`;
  const dimY = -bounds.y0 + pad * 0.45; // below the drawing
  const dimX = bounds.x0 - pad * 0.45; // left of the drawing
  return (
    <figure className="drawing">
      <svg viewBox={vb} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={props.title} id={props.id}>
        <rect x={bounds.x0 - pad} y={-bounds.y1 - pad} width={w + pad * 2} height={h + pad * 2} fill="#fff" />
        {rects.map((r, i) => (
          <rect
            key={i}
            x={r.x0}
            y={-r.y1}
            width={Math.max(0.5, r.x1 - r.x0)}
            height={Math.max(0.5, r.y1 - r.y0)}
            fill={FILL[r.role] ?? '#eee'}
            stroke={r.role === 'opening' ? '#4a8bd6' : r.role === 'wall' ? '#9a9890' : '#3d3f44'}
            strokeDasharray={r.role === 'opening' ? '4 3' : undefined}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <g stroke="#222" strokeWidth={1} vectorEffect="non-scaling-stroke">
          <line x1={bounds.x0} y1={dimY} x2={bounds.x1} y2={dimY} vectorEffect="non-scaling-stroke" />
          <line
            x1={bounds.x0}
            y1={dimY - font / 2}
            x2={bounds.x0}
            y2={dimY + font / 2}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={bounds.x1}
            y1={dimY - font / 2}
            x2={bounds.x1}
            y2={dimY + font / 2}
            vectorEffect="non-scaling-stroke"
          />
          <line x1={dimX} y1={-bounds.y0} x2={dimX} y2={-bounds.y1} vectorEffect="non-scaling-stroke" />
          <line
            x1={dimX - font / 2}
            y1={-bounds.y0}
            x2={dimX + font / 2}
            y2={-bounds.y0}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={dimX - font / 2}
            y1={-bounds.y1}
            x2={dimX + font / 2}
            y2={-bounds.y1}
            vectorEffect="non-scaling-stroke"
          />
        </g>
        <text x={(bounds.x0 + bounds.x1) / 2} y={dimY - font * 0.4} fontSize={font} textAnchor="middle" fill="#222">
          {Math.round(w)}
        </text>
        <text
          x={dimX - font * 0.4}
          y={-(bounds.y0 + bounds.y1) / 2}
          fontSize={font}
          textAnchor="middle"
          fill="#222"
          transform={`rotate(-90 ${dimX - font * 0.4} ${-(bounds.y0 + bounds.y1) / 2})`}
        >
          {Math.round(h)}
        </text>
      </svg>
      <figcaption>{props.title}</figcaption>
    </figure>
  );
}
