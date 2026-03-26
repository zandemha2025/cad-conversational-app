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

/** Color code based on tolerance tightness. */
function dimColor(tolerance_mm: number): string {
  if (tolerance_mm > 0 && tolerance_mm <= 0.05) return '#ef4444'; // very tight — red
  if (tolerance_mm > 0 && tolerance_mm <= 0.5) return '#f59e0b';  // tight — amber
  return '#10b981';                                                  // normal — emerald
}

export default function DimensionOverlay({ dimensions, positionScale = 0.01 }: Props) {
  return (
    <>
      {dimensions.map((dim, i) => {
        // Spread annotations around model centroid since API doesn't provide positions
        const angle = (i / Math.max(dimensions.length, 1)) * Math.PI * 2;
        const radius = 3 + Math.floor(i / 8);
        const px = Math.cos(angle) * radius;
        const py = 2 + i * 0.3;
        const pz = Math.sin(angle) * radius;
        const color = dimColor(dim.tolerance_mm);
        const valueStr = `${dim.value_mm.toFixed(2)} mm${dim.tolerance_mm > 0 ? ` ±${dim.tolerance_mm}` : ''}`;

        return (
          <group key={dim.id} position={[px * positionScale * 100, py * positionScale * 100, pz * positionScale * 100]}>
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
                  {dim.name}
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
                  {valueStr}
                </div>
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
