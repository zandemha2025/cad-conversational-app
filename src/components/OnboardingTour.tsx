/**
 * OnboardingTour — Guided first-visit tour with spotlight overlay.
 *
 * Usage:
 *   <OnboardingTour active={showTour} onDone={() => setShowTour(false)} />
 *
 * The tour is automatically skipped if localStorage 'scalecad_onboarding_v1' is set.
 * Call `OnboardingTour.reset()` (or clear localStorage) to replay the tour.
 */
import { useState, useEffect, useRef } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

const TOUR_KEY = 'scalecad_onboarding_v1';

interface Step {
  id: string;
  title: string;
  body: string;
  target: string | null; // element id to spotlight, null = centered modal
  placement?: 'right' | 'left' | 'bottom' | 'top';
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Welcome to ForgeAI!',
    body: 'Let me show you around the workspace. You can revisit this tour any time using the ? button in the toolbar.',
    target: null,
  },
  {
    id: 'chat',
    title: 'AI Chat',
    body: 'Describe what you want to build here. Try: "Design a fixture to hold a PCB board during soldering"',
    target: 'tour-chat-btn',
    placement: 'right',
  },
  {
    id: 'viewport',
    title: '3D Viewport',
    body: 'Your 3D model appears here as it generates. Orbit with left-click drag, scroll to zoom.',
    target: 'tour-viewport',
    placement: 'bottom',
  },
  {
    id: 'sidebar',
    title: 'Right Sidebar',
    body: 'Explore materials, work instructions, clamping forces, QC checklists, and version history.',
    target: 'tour-right-panel',
    placement: 'left',
  },
  {
    id: 'export',
    title: 'Export',
    body: 'When your design is ready, export as STEP, IGES, STL, or DXF for manufacturing.',
    target: 'tour-export-btn',
    placement: 'right',
  },
  {
    id: 'share',
    title: 'Share with Your Team',
    body: 'Share a link with teammates — they can view and comment without needing an account.',
    target: 'tour-share-btn',
    placement: 'bottom',
  },
];

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPos {
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  transform?: string;
}

function getTooltipPos(rect: SpotlightRect | null, placement: Step['placement']): TooltipPos {
  if (!rect) {
    // Centered
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }
  const pad = 16;
  switch (placement) {
    case 'right':
      return { top: rect.top + rect.height / 2, left: rect.left + rect.width + pad, transform: 'translateY(-50%)' };
    case 'left':
      return { top: rect.top + rect.height / 2, left: rect.left - pad, transform: 'translate(-100%, -50%)' };
    case 'bottom':
      return { top: rect.top + rect.height + pad, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
    case 'top':
      return { top: rect.top - pad, left: rect.left + rect.width / 2, transform: 'translate(-50%, -100%)' };
    default:
      return { top: rect.top + rect.height + pad, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
  }
}

interface Props {
  active: boolean;
  onDone: () => void;
}

export default function OnboardingTour({ active, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const rafRef = useRef<number>(0);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Track target element position (re-measure on each frame so it stays locked on resize/scroll)
  useEffect(() => {
    if (!active) return;
    function measure() {
      if (!current.target) {
        setSpotlight(null);
        return;
      }
      const el = document.getElementById(current.target);
      if (!el) { setSpotlight(null); return; }
      const r = el.getBoundingClientRect();
      setSpotlight({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    measure();
    // Throttled polling to keep spotlight locked if layout shifts
    const interval = setInterval(measure, 200);
    return () => { clearInterval(interval); cancelAnimationFrame(rafRef.current); };
  }, [active, current]);

  if (!active) return null;

  const PAD = 8;
  const spotRect = spotlight
    ? {
        top: spotlight.top - PAD,
        left: spotlight.left - PAD,
        width: spotlight.width + PAD * 2,
        height: spotlight.height + PAD * 2,
      }
    : null;

  const tooltipPos = getTooltipPos(spotRect, current.placement);

  function handleNext() {
    if (isLast) { finish(); return; }
    setStep(s => s + 1);
  }

  function finish() {
    localStorage.setItem(TOUR_KEY, '1');
    onDone();
  }

  return (
    <div className="fixed inset-0 z-[9990] pointer-events-none">
      {/* Dark backdrop — full screen */}
      <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={finish} />

      {/* Spotlight cutout — uses box-shadow to punch a hole in the backdrop */}
      {spotRect && (
        <div
          className="absolute rounded-lg pointer-events-none"
          style={{
            top: spotRect.top,
            left: spotRect.left,
            width: spotRect.width,
            height: spotRect.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.60)',
            border: '2px solid #3b82f6',
            zIndex: 9991,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute z-[9995] pointer-events-auto w-72"
        style={tooltipPos as React.CSSProperties}
      >
        <div className="bg-cadsurface-900 border border-cadsurface-600 rounded-2xl shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-0.5 bg-cadsurface-700">
            <div
              className="h-full bg-cadblue-500 transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>

          <div className="p-4">
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-[10px] text-cadblue-400 font-semibold uppercase tracking-wider mb-0.5">
                  Step {step + 1} of {STEPS.length}
                </p>
                <h3 className="text-sm font-bold text-slate-100">{current.title}</h3>
              </div>
              <button
                onClick={finish}
                className="text-slate-600 hover:text-slate-300 transition-colors ml-2 shrink-0 mt-0.5"
              >
                <X size={14} />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-4">{current.body}</p>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={step === 0}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={13} /> Back
              </button>

              <div className="flex gap-1">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      i === step ? 'bg-cadblue-400 w-3' : 'bg-cadsurface-600 hover:bg-cadsurface-400'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                className="flex items-center gap-1 text-xs font-medium text-white bg-cadblue-600 hover:bg-cadblue-500 px-3 py-1.5 rounded-lg transition-colors"
              >
                {isLast ? 'Get started' : 'Next'} {!isLast && <ChevronRight size={13} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Check whether the tour has been completed */
OnboardingTour.isCompleted = () => localStorage.getItem(TOUR_KEY) === '1';

/** Reset so the tour will show again on next visit */
OnboardingTour.reset = () => localStorage.removeItem(TOUR_KEY);
