# CAD Fidelity Audit — Expert Review

## Methodology
Each generated CadQuery script is evaluated against what a SolidWorks engineer would produce. Criteria:
- Correct geometry (shape, dimensions, topology)
- Correct operations (appropriate CAD operations for the shape)
- Engineering correctness (hole sizes, clearances, standards)
- Parametric quality (named variables, editable)

---

## S1: Rectangular Plate (200×150×20mm, 4× M10 corner holes)

**Script quality: 7/10**
- ✅ Uses .box() — correct
- ✅ Parametric variables (plate_length, plate_width, plate_thickness, hole_diameter)
- ✅ Uses M10 clearance hole (11.0mm) — CORRECT (10.5mm is standard, 11.0 acceptable)
- ✅ Rectangular hole pattern via .rect(forConstruction=True)
- ⚠️ Hole pattern spacing calculated from corner positions (170×120mm) — should just be (plate_length - 2*margin, plate_width - 2*margin)
- ❌ No counterbore specified — most mounting holes are counterbored in real fixtures

**SolidWorks comparison**: A SW engineer would use a linear pattern feature and likely add counterbores. The flat plate is geometrically correct but lacks standard fixture features.

---

## S2: Simple Cylinder (80mm dia × 70mm, 20mm bore)

**Script quality: 9/10**
- ✅ Uses .circle().circle().extrude() — CORRECT hollow cylinder
- ✅ Parametric variables (cylinder_diameter, cylinder_height, bore_diameter)
- ✅ Concentric circles for hollow extrusion — clean approach
- ✅ Correct dimensions
- ✅ Very clean, minimal code (514 chars)

**SolidWorks comparison**: This is exactly how you'd model it in SW — sketch two concentric circles, boss extrude. Nearly perfect.

---

## M1: Lidar Cylinder (80mm × 70mm, 3× M6 BCD60, 90° FOV wedge)

**Script quality: 8/10**
- ✅ Cylinder body using .circle().extrude() — correct
- ✅ M6 clearance holes (6.6mm) — CORRECT per ISO
- ✅ 3 holes at 120° spacing on 60mm BCD — correct polar pattern
- ✅ Holes on bottom face (.faces("<Z")) — correct
- ✅ FOV wedge built separately and .union()'d — correct approach
- ⚠️ Wedge uses polyline + extrude — would work but a true angular wedge would be more precise
- ⚠️ FOV wedge position at mid-height is approximate

**SolidWorks comparison**: Close to what SW would produce. The bolt pattern and cylinder are correct. The FOV wedge is a reasonable interpretation.

---

## M2: L-Bracket (100mm tall, 80mm base, 10mm thick, 2× M8 holes)

**Script quality: 7/10**
- ✅ Creates L-shape by cutting a block — valid approach
- ✅ M8 clearance holes (9.0mm) — CORRECT
- ✅ Non-centered box positioning for easier cutout math
- ⚠️ Uses faces("+Z").faces("<Z") selector — fragile, could break on complex geometry
- ⚠️ Hole positions are relative to absolute coordinates, not parametric relative to base length
- ❌ L-profile should ideally be sketch+extrude (polyline approach), not box-minus-box

**SolidWorks comparison**: A SW engineer would sketch the L-profile and extrude, not subtract a box. The box-minus-box approach works but is less clean. Hole placement is acceptable.

---

## H1: Arduino Enclosure (75×60×25mm, 2mm walls, open top, 4× M2.5 posts)

**Script quality: 8/10**
- ✅ Uses .shell() — CORRECT for enclosure
- ✅ Correct wall thickness (2mm)
- ✅ Mounting post locations converted from corner-based to center-based coords
- ✅ Post hole diameter 2.6mm for M2.5 — CORRECT (tapped hole drill size)
- ✅ Arduino-specific post locations — close to real Arduino Uno hole pattern
- ⚠️ Post locations (5.74, 5.84) etc. — real Arduino holes are at (14.0, 2.54), (66.04, 7.62), (66.04, 35.56), (15.24, 50.8) — THESE ARE WRONG
- ❌ Arduino hole pattern is NOT symmetric — the real board has asymmetric holes

**SolidWorks comparison**: The enclosure approach (shell + posts) is correct. But the mounting hole positions are wrong — they don't match the real Arduino Uno R3 hole pattern. A SW engineer would import the actual Arduino DXF/STEP or reference the datasheet.

---

## H2: iPhone 15 Pro Case (150×73×10mm, 1.5mm walls, camera cutout)

**Script quality: 5/10**
- ⚠️ Uses .cutBlind() pocket instead of .shell() — validation forced this change
- ✅ Camera cutout position attempted
- ❌ The "open front" is implemented as a shallow pocket on one face, not a shell with removed face
- ❌ Camera cutout position calculation is approximate, not based on real iPhone 15 Pro measurements
- ❌ No corner radius on the case (iPhone cases have ~8mm corner radius)
- ❌ No side button cutouts, port cutouts, or speaker holes
- ❌ 150×73mm dimensions — real iPhone 15 Pro is 146.7×71.5mm. The dimension_reference exists but wasn't used here

**SolidWorks comparison**: Very poor. A SW engineer would model a proper shell with corner radii, precise camera cutout based on Apple's case design guidelines, button cutouts, port clearances. This looks more like a crude box with a hole.

---

## E1: Spur Gear (20 teeth, module 2, 10mm face width, 8mm bore)

**Script quality: 7/10**
- ✅ Uses math for tooth profile — correct approach
- ✅ Correct module/teeth/diameter calculations (pitch_dia=40mm, outer=44mm, root=35mm)
- ✅ 8mm bore via .hole() — correct
- ⚠️ Tooth profile is TRAPEZOIDAL, not involute — real gears use involute curves
- ⚠️ Tooth width is tooth_angle/4 — should be tooth_angle/2 for 50% duty cycle
- ❌ No involute profile — this gear would not mesh properly with a mating gear
- ❌ No tip relief, root fillet, or profile modification

**SolidWorks comparison**: A SW engineer would use an involute curve equation or the Toolbox gear generator. The trapezoidal approximation is visible and identifiable as a gear, but wouldn't actually work as one. For visual representation it's OK, for manufacturing it's not.

---

## E2: Water Bottle (70mm dia, 200mm tall, tapered neck, 2mm walls)

**Script quality: 9/10**
- ✅ Uses .revolve() — CORRECT for rotationally symmetric body
- ✅ Outer profile revolved, then inner solid cut out — proper solid modeling
- ✅ Wall thickness maintained through inner/outer subtraction
- ✅ Tapered neck from body to top
- ✅ Open top (inner solid extends above)
- ✅ Clean parametric code
- ⚠️ Profile is straight-line segments, not smooth curves — real bottles have radiused transitions

**SolidWorks comparison**: Very close. A SW engineer would use a revolved boss with spline profiles for smooth transitions at the shoulder. The straight-line profile creates sharp transitions where a real bottle would be curved. But the approach (revolve + hollow) is exactly right.

---

## OVERALL FIDELITY SCORES

| Test | Shape | Dims | Engineering | Parametric | Total |
|------|-------|------|-------------|------------|-------|
| S1 Plate | 9 | 9 | 7 | 8 | 8.3/10 |
| S2 Cylinder | 10 | 10 | 10 | 9 | 9.8/10 |
| M1 Lidar | 9 | 9 | 9 | 8 | 8.8/10 |
| M2 L-Bracket | 7 | 8 | 8 | 7 | 7.5/10 |
| H1 Enclosure | 8 | 7 | 5 | 8 | 7.0/10 |
| H2 Phone Case | 4 | 6 | 3 | 6 | 4.8/10 |
| E1 Gear | 7 | 9 | 4 | 8 | 7.0/10 |
| E2 Bottle | 9 | 9 | 8 | 9 | 8.8/10 |

**Average: 7.5/10**

## CRITICAL ISSUES TO FIX

1. **Phone case is bad** — needs proper shell, corner radii, real iPhone dimensions from dimension_reference
2. **Gear tooth profile is trapezoidal** — needs involute curve approximation
3. **Arduino hole pattern is wrong** — needs real datasheet values from dimension_reference
4. **Dimension reference injection not working** — iPhone case should have used 146.7×71.5mm but used 150×73mm
5. **L-bracket uses box-minus-box** — should use polyline+extrude for cleaner topology
