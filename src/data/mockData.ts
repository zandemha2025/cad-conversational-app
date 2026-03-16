import type {
  Project,
  FeatureTreeItem,
  ChatMessage,
  ViewportObject,
  Material,
  DatumDefinition,
  GDTCallout,
  ToolingHardware,
  RevisionEntry,
  LocatingScheme,
  DFMWarning,
  EndEffectorSpec,
} from '../types';

// ─────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────
export const mockProjects: Project[] = [
  {
    id: 'p1',
    name: 'Wing Panel Drill Jig — PN 4471-A',
    description: 'Drill jig for wing skin panel fastener pattern. 4× renewable slip bushings, 3-2-1 locating on datum A/B/C. AS9100 release.',
    thumbnail: 'driljig',
    status: 'active',
    category: 'fixture',
    updatedAt: '2 hours ago',
    createdAt: '2026-02-10',
    parts: 8,
    assemblies: 1,
    drawings: 4,
    collaborators: ['AK', 'MR'],
    tags: ['aerospace', 'drill-jig', 'boeing'],
    revision: 'Rev B',
    partNumber: 'TL-4471-A',
  },
  {
    id: 'p2',
    name: 'Door Frame Welding Fixture',
    description: 'MIG welding fixture for automotive door frame subassembly. Toggle clamps, V-block locators, IATF 16949 traceability.',
    thumbnail: 'weld',
    status: 'active',
    category: 'fixture',
    updatedAt: '1 day ago',
    createdAt: '2026-01-28',
    parts: 22,
    assemblies: 3,
    drawings: 9,
    collaborators: ['TN', 'SL'],
    tags: ['automotive', 'welding', 'toyota'],
    revision: 'Rev A',
    partNumber: 'WF-2289-D',
  },
  {
    id: 'p3',
    name: 'EOAT Vacuum Gripper — P/N 8812',
    description: '6-cup vacuum end effector for KUKA KR 210. ISO 9409-1-50 flange. Handles composite skin panels up to 4kg.',
    thumbnail: 'eoat',
    status: 'active',
    category: 'end-effector',
    updatedAt: '3 days ago',
    createdAt: '2026-01-15',
    parts: 14,
    assemblies: 2,
    drawings: 6,
    collaborators: ['AK', 'JP'],
    tags: ['robotics', 'vacuum', 'end-effector'],
    revision: 'Rev C',
    partNumber: 'EE-8812',
  },
  {
    id: 'p4',
    name: 'Go/No-Go Gauge — Shaft Bore ⌀40H7',
    description: 'Plug gauge set for ⌀40H7 bore inspection. Go: ⌀40.000mm, No-Go: ⌀40.025mm. Hardened D2 tool steel.',
    thumbnail: 'gauge',
    status: 'released',
    category: 'gauge',
    updatedAt: '1 week ago',
    createdAt: '2026-01-05',
    parts: 4,
    assemblies: 1,
    drawings: 3,
    collaborators: [],
    tags: ['inspection', 'gauge', 'metrology'],
    revision: 'Rev A',
    partNumber: 'GA-40H7-001',
  },
  {
    id: 'p5',
    name: 'Assembly Locating Nest — Stator Ring',
    description: 'Precision locating nest for stator ring assembly. Kinematic mount with three ⌀6H7 tooling ball seats.',
    thumbnail: 'nest',
    status: 'draft',
    category: 'fixture',
    updatedAt: '2 weeks ago',
    createdAt: '2025-12-20',
    parts: 9,
    assemblies: 1,
    drawings: 3,
    collaborators: ['SL', 'MR'],
    tags: ['aerospace', 'locating', 'kinematic'],
    revision: 'Rev -',
    partNumber: 'TL-9901-S',
  },
  {
    id: 'p6',
    name: 'Turbine Blade Assembly',
    description: 'High-performance axial turbine blade with cooling channels and thermal barrier coating features.',
    thumbnail: 'turbine',
    status: 'archived',
    category: 'part',
    updatedAt: '1 month ago',
    createdAt: '2025-11-10',
    parts: 14,
    assemblies: 3,
    drawings: 6,
    collaborators: ['AK'],
    tags: ['aerospace', 'turbomachinery', 'thermal'],
    revision: 'Rev D',
    partNumber: 'TP-1140-B',
  },
];

// ─────────────────────────────────────────────
// FEATURE TREE — Drill Jig
// ─────────────────────────────────────────────
export const mockFeatureTree: FeatureTreeItem[] = [
  {
    id: 'origin',
    name: 'Origin',
    type: 'plane',
    children: [
      { id: 'datum-a', name: 'Datum A — Bottom Face', type: 'datum', params: { type: 'Primary', constrains: 'Z · Rx · Ry' } },
      { id: 'datum-b', name: 'Datum B — Back Edge', type: 'datum', params: { type: 'Secondary', constrains: 'Y · Rz' } },
      { id: 'datum-c', name: 'Datum C — Right Edge', type: 'datum', params: { type: 'Tertiary', constrains: 'X' } },
    ],
  },
  {
    id: 'sk1',
    name: 'Sketch1 — Base Profile',
    type: 'sketch',
    params: { entities: 4, constraints: 8, dof: 0 },
  },
  {
    id: 'ext1',
    name: 'Base_Plate-Extrude1',
    type: 'extrude',
    params: { depth: '15mm', material: 'Al 6061-T6', note: '150×100×15mm' },
  },
  {
    id: 'sk2',
    name: 'Sketch2 — Locating Pin Holes',
    type: 'sketch',
    params: { entities: 2, constraints: 6, dof: 0 },
  },
  {
    id: 'hole1',
    name: 'Locating_Pin_Hole1 (⌀6 H7)',
    type: 'hole',
    params: { diameter: '6mm', fit: 'H7', depth: 'Through', count: 1 },
  },
  {
    id: 'hole2',
    name: 'Locating_Pin_Hole2 (⌀6 H7)',
    type: 'hole',
    params: { diameter: '6mm', fit: 'H7', depth: 'Through', count: 1 },
  },
  {
    id: 'sk3',
    name: 'Sketch3 — Bushing Seat Layout',
    type: 'sketch',
    params: { entities: 4, constraints: 12, dof: 0 },
  },
  {
    id: 'cb1',
    name: 'Bushing_Seat_Counterbore ×4',
    type: 'counterbore',
    params: { boreDia: '14mm', cbDia: '20mm', cbDepth: '15mm', count: 4, spec: 'CL-12-RB' },
  },
  {
    id: 'cham1',
    name: 'Chamfer_Entry ×4',
    type: 'chamfer',
    params: { distance: '1mm', angle: '45°', edges: 4 },
  },
  {
    id: 'sk4',
    name: 'Sketch4 — Clamp Slots',
    type: 'sketch',
    params: { entities: 4, constraints: 8, dof: 0 },
  },
  {
    id: 'cut1',
    name: 'Clamp_Slot_Cut ×2',
    type: 'cut',
    params: { width: '14mm', depth: '8mm', length: '30mm' },
    suppressed: true,
  },
  {
    id: 'sk5',
    name: 'Sketch5 — Drill Relief',
    type: 'sketch',
    params: { entities: 4, constraints: 8, dof: 0 },
  },
  {
    id: 'cut2',
    name: 'Drill_Relief_Cut ×4',
    type: 'cut',
    params: { diameter: '25mm', depth: '3mm', note: 'Exit chip clearance' },
  },
  {
    id: 'filt1',
    name: 'Fillet_Edges — All Sharp',
    type: 'fillet',
    params: { radius: '2mm', edges: 12, type: 'Constant' },
  },
  {
    id: 'ann1',
    name: 'GD&T Annotations',
    type: 'annotation',
    params: { callouts: 4, standard: 'ASME Y14.5-2018' },
    children: [
      { id: 'ann-pos', name: '⊕ Position ⌀0.1 |A|B|C — Bushing Seats', type: 'annotation' },
      { id: 'ann-flat', name: '⏥ Flatness 0.05 — Datum A', type: 'annotation' },
      { id: 'ann-par', name: '∥ Parallelism 0.03 |A — Top Face', type: 'annotation' },
      { id: 'ann-perp', name: '⊥ Perp. 0.05 |A|B — Datum B', type: 'annotation' },
    ],
  },
];

// ─────────────────────────────────────────────
// CHAT MESSAGES — Drill Jig conversation
// ─────────────────────────────────────────────
export const mockChatMessages: ChatMessage[] = [
  {
    id: 'sys1',
    role: 'system',
    content: 'Wing Panel Drill Jig PN 4471-A — Part mode · Al 6061-T6',
    timestamp: '08:45',
  },
  {
    id: 'm1',
    role: 'user',
    content: 'Create a 150×100mm 6061-T6 aluminum tooling plate, 15mm thick. Origin at bottom-left corner.',
    timestamp: '08:46',
  },
  {
    id: 'm2',
    role: 'assistant',
    content: 'Created **Base_Plate-Extrude1** — 150×100×15mm on Top Plane. Material set to **Aluminum 6061-T6**.\n\nMass: **607g** · Volume: 225,000 mm³ · Origin: bottom-left corner as specified.',
    timestamp: '08:46',
    featureRefs: ['ext1'],
  },
  {
    id: 'm3',
    role: 'user',
    content: 'Add 4 drill bushing seats for 12mm renewable slip bushings at (20,20), (130,20), (20,80), (130,80).',
    timestamp: '08:49',
  },
  {
    id: 'm4',
    role: 'assistant',
    content: 'Added **Sketch3** with 4 bushing positions at specified XY coordinates. Created **Bushing_Seat_Counterbore ×4** — ⌀20mm liner bore × 15mm deep, ⌀14mm shoulder for bushing flange.\n\nBushing spec matched: **Carr Lane CL-12-RB** Renewable Slip Bushing (⌀12mm bore). Added 1×45° chamfer to all entry edges.\n\n⚠ *Drill relief cuts recommended for chip clearance — add now?*',
    timestamp: '08:49',
    featureRefs: ['sk3', 'cb1', 'cham1'],
  },
  {
    id: 'm5',
    role: 'user',
    content: 'Yes, add drill relief cuts. Then set Datum A on the bottom face and add a true position callout ⌀0.1 |A|B|C on the bushing seats.',
    timestamp: '08:52',
  },
  {
    id: 'm6',
    role: 'assistant',
    content: 'Added **Drill_Relief_Cut ×4** — ⌀25mm × 3mm exit clearance pockets beneath each bushing seat.\n\nSet **Datum A** annotation on Bottom Face (primary, 3 points). Added GD&T callout:\n\n**⊕ Position ⌀0.1(M) | A | B | C** — on all 4 bushing seats at MMC.\n\nTolerance zone: ⌀0.1mm cylindrical zone per ASME Y14.5-2018. Added to GD&T annotation layer.',
    timestamp: '08:53',
    featureRefs: ['cut2', 'ann-pos', 'datum-a'],
  },
  {
    id: 'm7',
    role: 'user',
    content: 'Run a 3-2-1 locating check.',
    timestamp: '08:55',
  },
  {
    id: 'm8',
    role: 'assistant',
    content: '**3-2-1 Locating Analysis**\n\n✓ **Primary (3 pts)** — Bottom Face: constrained Z · Rx · Ry\n✓ **Secondary (2 pts)** — Back Edge: constrained Y · Rz\n✓ **Tertiary (1 pt)** — Right Edge: constrained X\n\n**Status: FULLY CONSTRAINED** — 6 DOF locked.\n\n⚠ Recommend 2× toggle clamps at X=75, Y=50 to apply 150N clamping force against Datum A. No over-constraint detected.',
    timestamp: '08:55',
    featureRefs: ['datum-a', 'datum-b', 'datum-c'],
  },
];

// ─────────────────────────────────────────────
// VIEWPORT OBJECTS
// ─────────────────────────────────────────────
export const mockViewportObjects: ViewportObject[] = [
  { id: 'body1', name: 'Base Plate Body', type: 'body', visible: true, selected: false },
  { id: 'body2', name: 'Bushing Seat Cuts ×4', type: 'body', visible: true, selected: true },
  { id: 'body3', name: 'Locating Pin Holes ×2', type: 'body', visible: true, selected: false },
  { id: 'body4', name: 'Drill Relief Pockets ×4', type: 'body', visible: true, selected: false },
];

// ─────────────────────────────────────────────
// MATERIALS
// ─────────────────────────────────────────────
export const mockMaterials: Material[] = [
  { id: 'mat1', name: 'Aluminum 6061-T6', density: 2.70, youngsModulus: 69, yield: 276, color: '#c8d8e8' },
  { id: 'mat2', name: 'Aluminum Cast Tooling Plate', density: 2.71, youngsModulus: 71, yield: 248, color: '#d4e0ec' },
  { id: 'mat3', name: 'Alloy Steel 4140', density: 7.85, youngsModulus: 210, yield: 655, color: '#8ca3b4' },
  { id: 'mat4', name: 'D2 Tool Steel', density: 7.70, youngsModulus: 210, yield: 1520, color: '#6b8394' },
  { id: 'mat5', name: 'Stainless 316L', density: 8.00, youngsModulus: 193, yield: 170, color: '#d0d8dc' },
  { id: 'mat6', name: 'Titanium Ti-6Al-4V', density: 4.43, youngsModulus: 114, yield: 880, color: '#b0c4cc' },
  { id: 'mat7', name: 'PEEK (Unfilled)', density: 1.31, youngsModulus: 3.6, yield: 100, color: '#e8d4a0' },
];

// ─────────────────────────────────────────────
// PROPERTIES
// ─────────────────────────────────────────────
export const mockPropertiesGeneral = [
  { label: 'Part Number', value: 'TL-4471-A', unit: '', editable: false },
  { label: 'Revision', value: 'Rev B', unit: '', editable: false },
  { label: 'Material', value: 'Al 6061-T6', unit: '', editable: true },
  { label: 'Mass', value: '607', unit: 'g', editable: false },
  { label: 'Volume', value: '225,000', unit: 'mm³', editable: false },
  { label: 'Surface Area', value: '71,500', unit: 'mm²', editable: false },
  { label: 'Density', value: '2.70', unit: 'g/cm³', editable: false },
];

export const mockPropertiesDimensions = [
  { label: 'Overall Length', value: '150', unit: 'mm', editable: true },
  { label: 'Overall Width', value: '100', unit: 'mm', editable: true },
  { label: 'Thickness', value: '15', unit: 'mm', editable: true },
  { label: 'Bushing Bore ⌀', value: '12', unit: 'mm', editable: true },
  { label: 'Liner Bore ⌀', value: '20', unit: 'mm', editable: true },
  { label: 'Pin Hole ⌀', value: '6', unit: 'mm', editable: true },
];

// ─────────────────────────────────────────────
// GD&T DATA
// ─────────────────────────────────────────────
export const mockDatums: DatumDefinition[] = [
  {
    id: 'dat-a',
    label: 'A',
    type: 'primary',
    feature: 'Bottom Face',
    description: 'Primary datum — machined flat ground surface',
    points: 3,
    constrains: ['Z', 'Rx', 'Ry'],
  },
  {
    id: 'dat-b',
    label: 'B',
    type: 'secondary',
    feature: 'Back Edge Face',
    description: 'Secondary datum — milled edge, perpendicular to A',
    points: 2,
    constrains: ['Y', 'Rz'],
  },
  {
    id: 'dat-c',
    label: 'C',
    type: 'tertiary',
    feature: 'Right Edge Face',
    description: 'Tertiary datum — milled edge, perpendicular to A & B',
    points: 1,
    constrains: ['X'],
  },
];

export const mockGDTCallouts: GDTCallout[] = [
  {
    id: 'gdt1',
    symbol: 'position',
    tolerance: '⌀0.1',
    modifiers: 'M',
    datum1: 'A',
    datum2: 'B',
    datum3: 'C',
    appliedTo: 'Bushing Seats ×4',
    standard: 'ASME Y14.5-2018',
  },
  {
    id: 'gdt2',
    symbol: 'flatness',
    tolerance: '0.05',
    appliedTo: 'Datum A — Bottom Face',
    standard: 'ASME Y14.5-2018',
  },
  {
    id: 'gdt3',
    symbol: 'parallelism',
    tolerance: '0.03',
    datum1: 'A',
    appliedTo: 'Top Face',
    standard: 'ASME Y14.5-2018',
  },
  {
    id: 'gdt4',
    symbol: 'perpendicularity',
    tolerance: '0.05',
    datum1: 'A',
    datum2: 'B',
    appliedTo: 'Datum B Face',
    standard: 'ASME Y14.5-2018',
  },
];

// ─────────────────────────────────────────────
// HARDWARE LIBRARY
// ─────────────────────────────────────────────
export const mockHardwareLibrary: ToolingHardware[] = [
  // Drill Bushings
  {
    id: 'hw1',
    partNumber: 'CL-12-RB',
    name: 'Renewable Slip Bushing ⌀12mm',
    category: 'bushing',
    supplier: 'Carr Lane',
    description: 'Slip renewable drill bushing, ⌀12mm bore',
    specs: { bore: '12mm', OD: '20mm', length: '15mm', material: 'Tool Steel', hardness: 'HRC 60' },
    price: '$4.20',
    inStock: true,
    preferred: true,
  },
  {
    id: 'hw2',
    partNumber: 'CL-16-RB',
    name: 'Renewable Slip Bushing ⌀16mm',
    category: 'bushing',
    supplier: 'Carr Lane',
    description: 'Slip renewable drill bushing, ⌀16mm bore',
    specs: { bore: '16mm', OD: '25mm', length: '20mm', material: 'Tool Steel', hardness: 'HRC 60' },
    price: '$5.10',
    inStock: true,
    preferred: false,
  },
  {
    id: 'hw3',
    partNumber: 'CL-12-FB',
    name: 'Fixed Liner Bushing ⌀12mm',
    category: 'bushing',
    supplier: 'Carr Lane',
    description: 'Fixed press-fit liner bushing, ⌀12mm bore',
    specs: { bore: '12mm', OD: '20mm', length: '15mm', material: 'Tool Steel', hardness: 'HRC 60' },
    price: '$2.80',
    inStock: true,
    preferred: false,
  },
  {
    id: 'hw4',
    partNumber: 'CL-8-RB',
    name: 'Renewable Slip Bushing ⌀8mm',
    category: 'bushing',
    supplier: 'Carr Lane',
    description: 'Slip renewable drill bushing, ⌀8mm bore',
    specs: { bore: '8mm', OD: '16mm', length: '12mm', material: 'Tool Steel', hardness: 'HRC 60' },
    price: '$3.60',
    inStock: false,
    preferred: false,
  },
  // Toggle Clamps
  {
    id: 'hw5',
    partNumber: 'DC-205-U',
    name: 'Hold-Down Toggle Clamp 150N',
    category: 'clamp',
    supplier: 'Destaco',
    description: 'Vertical acting hold-down toggle clamp, 150N clamping force',
    specs: { clampForce: '150N', weight: '0.28kg', bodyMaterial: 'Steel', footprint: '50×30mm' },
    price: '$18.50',
    inStock: true,
    preferred: true,
  },
  {
    id: 'hw6',
    partNumber: 'DC-215-U',
    name: 'Hold-Down Toggle Clamp 530N',
    category: 'clamp',
    supplier: 'Destaco',
    description: 'Vertical acting hold-down toggle clamp, 530N clamping force',
    specs: { clampForce: '530N', weight: '0.5kg', bodyMaterial: 'Steel', footprint: '70×40mm' },
    price: '$26.00',
    inStock: true,
    preferred: false,
  },
  {
    id: 'hw7',
    partNumber: 'KIPP-6337',
    name: 'Strap Clamp M10',
    category: 'clamp',
    supplier: 'Kipp',
    description: 'Step strap clamp for T-slot fixtures, M10 bolt',
    specs: { boltSize: 'M10', clampHeight: '10–40mm', material: 'Steel' },
    price: '$9.80',
    inStock: true,
    preferred: false,
  },
  // Locating Pins
  {
    id: 'hw8',
    partNumber: 'MISU-DPDP6H7',
    name: 'Diamond Locating Pin ⌀6 H7',
    category: 'pin',
    supplier: 'Misumi',
    description: 'Diamond-shaped locating pin, ⌀6mm H7 tolerance',
    specs: { diameter: '6mm', fit: 'H7', material: 'SCM415 (case hardened)', length: '30mm' },
    price: '$6.40',
    inStock: true,
    preferred: true,
  },
  {
    id: 'hw9',
    partNumber: 'MISU-RPLP8H7',
    name: 'Round Locating Pin ⌀8 H7',
    category: 'pin',
    supplier: 'Misumi',
    description: 'Round press-fit locating pin, ⌀8mm H7 tolerance',
    specs: { diameter: '8mm', fit: 'H7', material: 'SCM415 (case hardened)', length: '35mm' },
    price: '$5.20',
    inStock: true,
    preferred: false,
  },
  {
    id: 'hw10',
    partNumber: 'CL-TB-12',
    name: 'Tooling Ball ⌀12.7mm',
    category: 'locator',
    supplier: 'Carr Lane',
    description: 'Precision tooling ball for CMM reference and kinematic mounting',
    specs: { diameter: '12.7mm (0.5")', sphericity: '±0.0005mm', material: '52100 Bearing Steel', thread: 'M6' },
    price: '$22.00',
    inStock: true,
    preferred: true,
  },
  // Supports
  {
    id: 'hw11',
    partNumber: 'CL-RB10',
    name: 'Rest Button ⌀10mm Fixed',
    category: 'support',
    supplier: 'Carr Lane',
    description: 'Fixed rest button for primary datum surface contact',
    specs: { diameter: '10mm', height: '8mm', material: 'Tool Steel', hardness: 'HRC 58', thread: 'M6' },
    price: '$4.80',
    inStock: true,
    preferred: true,
  },
  {
    id: 'hw12',
    partNumber: 'CL-AS10',
    name: 'Adjustable Support Screw M10',
    category: 'support',
    supplier: 'Carr Lane',
    description: 'Adjustable jack screw for secondary support points',
    specs: { thread: 'M10', adjustRange: '10–25mm', material: 'Steel', lockNut: 'Included' },
    price: '$7.20',
    inStock: true,
    preferred: false,
  },
  // End Effector / Robot
  {
    id: 'hw13',
    partNumber: 'ISO9409-1-50-4-M6',
    name: 'Robot Flange ISO 9409-1 50mm',
    category: 'flange',
    supplier: 'Schunk',
    description: 'ISO 9409-1 compliant robot tool flange, 50mm pattern, 4×M6',
    specs: { standard: 'ISO 9409-1', pattern: '⌀50mm', bolts: '4×M6', centerBore: '⌀31.5mm', compatibility: 'KUKA KR, ABB IRB' },
    price: '$48.00',
    inStock: true,
    preferred: true,
  },
  {
    id: 'hw14',
    partNumber: 'VAS-40-SI',
    name: 'Vacuum Suction Cup ⌀40mm',
    category: 'suction',
    supplier: 'Schmalz',
    description: 'Bellows vacuum suction cup, silicone, ⌀40mm, 50N lift capacity',
    specs: { diameter: '40mm', material: 'Silicone', liftCapacity: '50N', maxPressure: '-0.9 bar', thread: 'G1/4"' },
    price: '$12.40',
    inStock: true,
    preferred: true,
  },
  {
    id: 'hw15',
    partNumber: 'VAS-60-NBR',
    name: 'Vacuum Suction Cup ⌀60mm',
    category: 'suction',
    supplier: 'Schmalz',
    description: 'Flat vacuum suction cup, NBR, ⌀60mm, 110N lift capacity',
    specs: { diameter: '60mm', material: 'NBR', liftCapacity: '110N', maxPressure: '-0.9 bar', thread: 'G1/4"' },
    price: '$16.80',
    inStock: false,
    preferred: false,
  },
];

// ─────────────────────────────────────────────
// REVISION HISTORY
// ─────────────────────────────────────────────
export const mockRevisionHistory: RevisionEntry[] = [
  {
    rev: 'Rev B',
    status: 'released',
    date: '2026-03-10',
    author: 'AK',
    ecrNumber: 'ECR-2847',
    description: 'Added 4th bushing seat; updated GD&T position tolerance to ⌀0.1',
    changes: [
      'Added bushing seat position (130,80) per NCR-192',
      'Updated position tolerance from ⌀0.15 to ⌀0.1 |A|B|C',
      'Revised Datum B from side face to back edge per design review',
    ],
  },
  {
    rev: 'Rev A',
    status: 'released',
    date: '2026-02-24',
    author: 'MR',
    ecrNumber: 'ECR-2761',
    description: 'Initial release after prototype validation',
    changes: [
      'Base plate geometry finalized — 150×100×15mm',
      'Three bushing seats added per original jig plan',
      'GD&T added per ASME Y14.5-2018',
    ],
  },
  {
    rev: 'Rev -',
    status: 'prototype',
    date: '2026-02-10',
    author: 'MR',
    description: 'Initial prototype design',
    changes: ['Initial design created from conversation prompt', 'Material: Al 6061-T6 selected'],
  },
];

// ─────────────────────────────────────────────
// 3-2-1 LOCATING SCHEME
// ─────────────────────────────────────────────
export const mockLocatingScheme: LocatingScheme = {
  name: '3-2-1 Locating — Wing Panel Drill Jig',
  points: [
    { id: 'lp1', type: 'primary', feature: 'Bottom Face (Datum A)', position: 'P1: X=25, Y=20', constrains: ['Z'] },
    { id: 'lp2', type: 'primary', feature: 'Bottom Face (Datum A)', position: 'P2: X=125, Y=20', constrains: ['Rx'] },
    { id: 'lp3', type: 'primary', feature: 'Bottom Face (Datum A)', position: 'P3: X=75, Y=80', constrains: ['Ry'] },
    { id: 'lp4', type: 'secondary', feature: 'Back Edge (Datum B)', position: 'P4: X=30, Z=7.5', constrains: ['Y'] },
    { id: 'lp5', type: 'secondary', feature: 'Back Edge (Datum B)', position: 'P5: X=120, Z=7.5', constrains: ['Rz'] },
    { id: 'lp6', type: 'tertiary', feature: 'Right Edge (Datum C)', position: 'P6: Y=50, Z=7.5', constrains: ['X'] },
  ],
  clampForce: '150N each',
  clampCount: 2,
  status: 'fully-constrained',
};

// ─────────────────────────────────────────────
// DFM WARNINGS
// ─────────────────────────────────────────────
export const mockDFMWarnings: DFMWarning[] = [
  {
    id: 'dfm1',
    severity: 'warning',
    rule: 'Drill depth / diameter ratio',
    description: 'Bushing bore depth/diameter = 15/12 = 1.25 — within limits (< 3:1)',
    feature: 'Bushing_Seat_Counterbore ×4',
    recommendation: 'OK — no action required',
  },
  {
    id: 'dfm2',
    severity: 'info',
    rule: 'Standard drill size check',
    description: 'All drill diameters match standard catalogue sizes (⌀6, ⌀12, ⌀20, ⌀25)',
    feature: 'All hole features',
    recommendation: 'OK — all sizes are standard',
  },
  {
    id: 'dfm3',
    severity: 'warning',
    rule: 'Min wall thickness',
    description: 'Wall between bushing seat at (130,80) and plate edge = 7mm. Minimum recommended: 6mm',
    feature: 'Bushing_Seat_Counterbore[4]',
    recommendation: 'Monitor — within spec but near minimum',
  },
  {
    id: 'dfm4',
    severity: 'error',
    rule: 'Clamp slots suppressed',
    description: 'Clamp_Slot_Cut ×2 is suppressed — toggle clamps cannot be mounted',
    feature: 'Clamp_Slot_Cut ×2',
    recommendation: 'Unsuppress clamp slots before release',
  },
];

// ─────────────────────────────────────────────
// END EFFECTOR SPEC
// ─────────────────────────────────────────────
export const mockEndEffectorSpec: EndEffectorSpec = {
  robotFlange: 'ISO 9409-1-50-4-M6 (KUKA KR 210)',
  tcpOffset: 'X: 0mm, Y: 0mm, Z: 145mm',
  payload: '3.8 kg (rated: 4.0 kg)',
  comOffset: 'X: +2.1mm, Y: -0.8mm, Z: +68mm',
  vacuumPorts: 6,
  operatingPressure: '-0.7 bar',
  graspForce: '300N total (6 × 50N)',
  toolChangerInterface: 'ATI QC-005 (placeholder)',
};

// ─────────────────────────────────────────────
// RECENT ACTIVITY
// ─────────────────────────────────────────────
export const recentActivity = [
  { time: '2h ago', event: 'Bushing_Seat_Counterbore ×4 modified — depth 12mm → 15mm', user: 'You' },
  { time: '5h ago', event: 'GD&T Position tolerance updated ⌀0.15 → ⌀0.1 |A|B|C', user: 'AK' },
  { time: '1d ago', event: 'Datum B redefined from side face to back edge (ECR-2847)', user: 'MR' },
  { time: '2d ago', event: 'Rev B released — drawing package exported to PDF', user: 'AK' },
];
