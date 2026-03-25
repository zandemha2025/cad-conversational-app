/**
 * DimensionOverlay — renders AI-extracted dimension callouts as floating HTML
 * elements inside the R3F canvas, positioned in 3D space near the model.
 *
 * Positions come from the API in millimetres relative to the model centroid.
 * We apply a positionScale factor to map those mm values into the Three.js
 * world-coordinate system (default 0.01 → 1 unit ≈ 100 mm).
 */

import { Html } from '@react-three/drei';
import type { DimensionEntry } from '../lib/api';

interface Props {
  dimensions: DimensionEntry[];
  /** mm → Three.js world-unit scale. Default 0.01 (1 unit = 100 mm). */
  positionScale?: number;
}

/** Color code based on tolerance tightness in the value string. */
function dimColor(value: string): string {
  // Very tight: ±0.0X
  if (/±\s*0\.0[0-9]/.test(value)) return '#ef4444'; // red
  // Any explicit tolerance
  if (/±/.test(value)) return '#f59e0b';              // amber
  // Normal
  return '#10b981';                                    // emerald
}

export default function DimensionOverlay({ dimensions, positionScale = 0.01 }: Props) {
  return (
    <>
      {dimensions.map((dim, i) => {
        const s = positionScale;
        const px = (dim.position[0] ?? 0) * s;
        const py = (dim.position[1] ?? 0) * s;
        const pz = (dim.position[2] ?? 0) * s;
        const color = dimColor(dim.value);

        return (
          <group key={i} position={[px, py, pz]}>
            {/* Small marker dot */}
            <mesh>
              <sphereGeometry args={[0.012, 6, 6]} />
              <meshBasicMaterial color={color} />
            </mesh>

            <Html
              center
              distanceFactor={10}
              zIndexRange={[50, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div
                style={{
                  background: 'rgba(8, 14, 30, 0.88)',
                  border: `1px solid ${color}55`,
                  borderLeft: `2px solid ${color}`,
                  borderRadius: '3px',
                  padding: '3px 7px 3px 6px',
                  whiteSpace: 'nowrap',
                  backdropFilter: 'blur(6px)',
                  userSelect: 'none',
                  minWidth: '72px',
                }}
              >
                <div
                  style={{
                    fontSize: '7px',
                    color: '#64748b',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    marginBottom: '1px',
                    fontFamily: 'sans-serif',
                  }}
                >
                  {dim.label}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    fontFamily: '"Courier New", monospace',
                    fontWeight: 700,
                    color,
                    lineHeight: 1.1,
                  }}
                >
                  {dim.value}
                </div>
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
