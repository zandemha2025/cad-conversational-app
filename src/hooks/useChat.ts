/**
 * useChat — WebSocket hook for the ForgeAI chat panel.
 *
 * Falls back to smart keyword-matched fixture responses in DEMO MODE.
 *
 * Protocol:
 *   → { type: "auth", token: "..." }
 *   ← { type: "auth_ok" }
 *   → { type: "message", content: "...", attachments: [] }
 *   ← { type: "thinking", intent: "..." }
 *   ← { type: "chunk", content: "..." }   (streamed)
 *   ← { type: "done", intent: "...", job_id: null|"..." }
 *   ← { type: "generation_queued", job_id: "..." }
 *   ← { type: "error", detail: "..." }
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { WS_URL, IS_DEMO, getToken } from '../lib/api';
import type { ChatMessage } from '../types';

interface UseChatOptions {
  projectId: string | undefined;
  initialMessages?: ChatMessage[];
}

interface GenerationJob {
  jobId: string;
  message: string;
}

// ── Smart demo responses ──────────────────────────────────────────────────────

function getDemoResponse(input: string): string {
  const q = input.toLowerCase();

  if (/\b(3-2-1|321|constraint|datum|dof|degree[s]? of freedom)\b/.test(q)) {
    return `**3-2-1 Locating Principle**

Your fixture must constrain all **6 degrees of freedom** before machining begins:

| Datum | DOF constrained | Typical feature |
|-------|----------------|-----------------|
| **A** (primary) | Z-translation + X/Y rotation | 3 support pads |
| **B** (secondary) | X-translation + Z rotation | 2 locating pins |
| **C** (tertiary) | Y-translation | 1 locating pin or stop |

**Current status on this project:** 3 support pads ✓ · 2 locating pins ✓ · 1 clamp ✓ → **Fully constrained (6/6 DOF)**

*Pro tip: For aluminum panels, Datum A should be the largest flat face to maximise stability under cutting forces.*`;
  }

  if (/\b(dfm|design for manufacture|wall|thickness|print|fdm|nozzle)\b/.test(q)) {
    return `**DFM Analysis — FDM / 3D Print**

I found **2 errors** blocking export on the current fixture design:

1. 🔴 **Wall too thin at Clamp Slot ②** — 0.9mm measured, minimum 1.6mm for PA12-CF @ 0.4mm nozzle. _Fix: increase wall to 1.8mm in Node params._

2. 🔴 **Clamp Slots ×2 node suppressed** — The fixture will export without clamping features. _Fix: unsuppress the node in the Nodes view._

**Warnings (2):**
- Bushing bore ④ needs +0.2mm FDM tolerance offset (undersizing compensation)
- Datum A face requires post-print surface grinding to achieve ⏥ 0.05mm flatness

*Estimated print time: 4h 20min on Bambu X1C @ 0.20mm layers, PA12-CF, 25% gyroid infill.*`;
  }

  if (/\b(clamp|clamping force|strap|toggle|pneumatic)\b/.test(q)) {
    return `**Clamping Configuration**

Current clamps on **TL-4471-A**:

| ID | Type | Force | Location |
|----|------|-------|----------|
| TP-03 | Mitee-Bite M8 strap clamp | **320 N** | Top face, centre-left |
| TP-04 | De-Sta-Co 225U toggle clamp | **490 N** | Top face, centre-right |

**Total: 810 N** — Safety factor vs. estimated machining loads (200 N): **4.05×** ✓

For aerospace-grade fixtures (AS9100), a safety factor of ≥ 3.0× is recommended. You're within spec.

*If you increase the clamping force beyond 1000 N, consider adding a support pad under TP-03 to prevent part deflection.*`;
  }

  if (/\b(gdt|gd&t|tolerance|datum|position|flatness|parallelism|asme|y14\.5)\b/.test(q)) {
    return `**GD&T Review — ASME Y14.5-2018**

Callouts on the current drawing are **valid** per ASME Y14.5-2018:

- **⊕ ⌀0.1(M)|A|B|C** — True position on bushing bores. MMC modifier allows bonus tolerance when bore is at MMC (smallest acceptable size).
- **⏥ 0.05|A** — Flatness on Datum A face. *⚠ Cannot be achieved with FDM — requires surface grinding or lapping post-print.*
- **⌀6 H7** on locating pin bores — standard fit, +0.000/+0.012mm tolerance.

**Warnings:**
- No material cert requirement specified on BOM (AS9100 Rev D §8.4 requires lot traceability)
- Revision block incomplete — drawing shows Rev B but no change log entry

*Do you want me to generate an updated title block with the ECR-2847 change log populated?*`;
  }

  if (/\b(material|aluminum|aluminium|6061|pa12|nylon|carbon fibre|carbon fiber|steel)\b/.test(q)) {
    return `**Material Selection**

**For the jig plate (TL-4471-A):**
- **Al 6061-T6** (current) — Best all-round choice. Machineable, anodisable, 276 MPa yield strength. Weight: ~0.61 kg.
- **Al 7075-T6** — Higher strength (503 MPa) but more expensive and harder to anodise. Use for high-load applications.
- **PA12-CF** (3D print) — Great for low-volume, complex geometry. 0.61 g/cc (lighter than Al). Requires post-process for Datum A flatness.

**For tooling pins:**
- **SCM415 (case-hardened)** — Standard. HRC 60 surface, tough core.
- **A2 tool steel** — For higher wear resistance at elevated temperatures.

*Current spec (Al 6061-T6 + SCM415 pins + A2-70 SS fasteners) is a solid aerospace-grade combination.*`;
  }

  if (/\b(export|step|stl|3mf|pdf|drawing|dxf)\b/.test(q)) {
    return `**Export Options**

| Format | Use case | Status |
|--------|----------|--------|
| **STEP** | Downstream CAD, CNC CAM, customer handoff | ✓ Available |
| **STL** | 3D printing slicer (Bambu Studio, PrusaSlicer) | ✓ Available |
| **3MF** | Preferred for print — includes colour + material metadata | ✓ Available |
| **PDF** | Engineering drawing with BOM + title block | ✓ Client-side export |

*Use the Drawing tab → Export PDF button to generate a production-ready A3 drawing with GD&T callouts, BOM, and title block.*

⚠️ **2 DFM errors** must be resolved before the STEP/STL exports are unblocked (suppressed clamp slots + thin wall).`;
  }

  if (/\b(bushing|liner|press fit|slip|renewable|drill)\b/.test(q)) {
    return `**Drill Bushing Specification**

Bushings on TL-4471-A:
- **Type:** CL-12-RB — Renewable Slip Bushing ⌀12mm OD / ⌀10mm ID
- **Material:** Tool steel HRC 60 case-hardened
- **Supplier:** Misumi (leadtime 3–5 days)
- **Qty:** 4× (Items 2 in BOM)

**Counterbore spec:**
- Bore: ⌀12.000 / +0.000 / +0.018mm (H7 fit)
- Depth: 15mm (1.25× OD for adequate engagement)
- Shoulder: 0.5mm clearance for liner flange

*⚠ FDM tolerance note: As-printed bore is typically 0.2–0.4mm undersized. Enable the tolerance offset node (+0.20mm) before slicing.*`;
  }

  if (/\b(generate|create|make|design|build|new fixture|new jig)\b/.test(q)) {
    return `**Fixture Generation**

I can generate a complete fixture design from a part description or uploaded STEP file. To begin:

1. **Upload a STEP file** using the cloud icon in the toolbar — I'll extract the geometry, identify datum faces, and propose a 3-2-1 locating scheme.

2. **Or describe the part:**
   - Part material and dimensions
   - Key features to locate against (datum faces, holes)
   - Manufacturing process (FDM / CNC / Laser)
   - Machine table (e.g. Siegmund 28mm × 28mm grid)

**Example prompt:** *"Design a drill jig for a 165×115×15mm Al 6061-T6 wing rib doubler with four ⌀12mm bushing locations. Machine table: Siegmund 28mm grid. Print method: PA12-CF FDM."*

*In live mode, this triggers the full AI pipeline: Gemini Pro → KCL code → Zoo.dev kernel → 3D geometry → validation.*`;
  }

  if (/\b(hello|hi|hey|help|what can you do|capabilities)\b/.test(q)) {
    return `**ForgeAI — AI Fixture Design Assistant**

I can help you with:

- 🔩 **Fixture design** — Generate complete 3-2-1 locating schemes from part geometry
- 🛡️ **DFM analysis** — Check wall thickness, overhang, bore tolerances, print time estimates
- 📐 **GD&T** — Review callouts, datum reference frames, tolerance stacks (ASME Y14.5-2018 / ISO 2768)
- 🔧 **Hardware selection** — Bushings, locating pins, clamps, support pads from the library
- 📄 **Drawing generation** — Auto-populate title blocks, BOM, revision notes (AS9100)
- 🏭 **Standards compliance** — AS9100 Rev D, ASME Y14.5, ITAR flagging

*Connect the backend (set \`VITE_API_URL\`) to enable real AI generation via Gemini 2.0 Pro + Zoo.dev KCL.*

What would you like to work on?`;
  }

  // Default fallback
  return `*(Demo mode — Gemini backend not connected)*

I understand your question about **"${input.slice(0, 60)}${input.length > 60 ? '…' : ''}"** — to get a real AI response, connect the backend:

\`\`\`
# .env.local
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
\`\`\`

In the meantime, try asking about: **3-2-1 locating**, **DFM analysis**, **GD&T callouts**, **material selection**, **clamping force**, **export formats**, or **how to generate a fixture**.`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChat({ projectId, initialMessages = [] }: UseChatOptions) {
  const [messages, setMessages]         = useState<ChatMessage[]>(initialMessages);
  const [isThinking, setIsThinking]     = useState(false);
  const [isConnected, setIsConnected]   = useState(false);
  const [activeGenJob, setActiveGenJob] = useState<GenerationJob | null>(null);

  const wsRef          = useRef<WebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);

  const connect = useCallback(() => {
    if (IS_DEMO || !projectId || !WS_URL) return;

    const url = `${WS_URL}/api/projects/${projectId}/chat`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      const token = getToken() || 'demo';
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data) as Record<string, unknown>;

      if (msg.type === 'auth_ok') { setIsConnected(true); return; }

      if (msg.type === 'thinking') {
        setIsThinking(true);
        streamingIdRef.current = null;
        return;
      }

      if (msg.type === 'chunk') {
        const chunk = msg.content as string;
        setMessages(prev => {
          if (!streamingIdRef.current) {
            const id = `stream_${Date.now()}`;
            streamingIdRef.current = id;
            return [...prev, {
              id, role: 'assistant' as const, content: chunk,
              timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            }];
          }
          return prev.map(m => m.id === streamingIdRef.current ? { ...m, content: m.content + chunk } : m);
        });
        return;
      }

      if (msg.type === 'done') {
        setIsThinking(false);
        streamingIdRef.current = null;
        return;
      }

      if (msg.type === 'generation_queued') {
        setActiveGenJob({ jobId: msg.job_id as string, message: msg.message as string });
        return;
      }

      if (msg.type === 'error') {
        setIsThinking(false);
        streamingIdRef.current = null;
        setMessages(prev => [...prev, {
          id: `err_${Date.now()}`, role: 'system' as const,
          content: `⚠ ${msg.detail}`,
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        }]);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [projectId]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  const sendMessage = useCallback((content: string, attachments: unknown[] = []) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: 'user', content, timestamp: ts };
    setMessages(prev => [...prev, userMsg]);

    if (IS_DEMO || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setIsThinking(true);
      // Simulate streaming in demo mode
      const response = getDemoResponse(content);
      const chunks = response.split(/(?<=\n)/);
      let accumulated = '';
      const streamId = `ai_${Date.now()}`;

      setMessages(prev => [...prev, {
        id: streamId, role: 'assistant', content: '',
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      }]);

      let i = 0;
      const interval = setInterval(() => {
        if (i >= chunks.length) {
          clearInterval(interval);
          setIsThinking(false);
          return;
        }
        accumulated += chunks[i++];
        const snap = accumulated;
        setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: snap } : m));
      }, 30);

      return;
    }

    setIsThinking(true);
    wsRef.current.send(JSON.stringify({ type: 'message', content, attachments }));
  }, []);

  return { messages, isThinking, isConnected, activeGenJob, sendMessage, setMessages };
}
