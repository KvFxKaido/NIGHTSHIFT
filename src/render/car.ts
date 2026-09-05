import * as THREE from "three";
import {
  PAINT_OPTIONS,
  STANCE_OPTIONS,
  WHEEL_OPTIONS,
  type CarCustomization,
} from "../customization/customization.ts";

// The tyre and the bodywork that has to clear it are one relationship, not two
// sets of numbers that happen to agree today. Everything that crosses a wheel
// derives from these, so a change to ride height or tyre size cannot silently
// start cutting through paint.
export const CAR_GEOMETRY = {
  wheelCenterY: 0.4,
  tireRadius: 0.36,
  tireHalfWidth: 0.125,
  axleZ: 1.35,
  halfTrack: 0.92,
  maxSteerAngle: 0.42,
  wheelWellMargin: 0.02,
  /** Visible tyre-to-fender gap at Street stance. Lowering spends this. */
  archClearance: 0.1,
} as const;

export const ARCH_INNER_RADIUS = CAR_GEOMETRY.tireRadius + CAR_GEOMETRY.archClearance;
/** Top of the tyre in body-shell space; nothing solid may sit below this. */
export const TIRE_CROWN_Y = CAR_GEOMETRY.wheelCenterY + CAR_GEOMETRY.tireRadius;

// Full-lock tyres sweep inward farther than their straight-ahead sidewalls.
// Reserve that space at the deepest inset, with a little air to the liner.
const MAX_WHEEL_INSET = Math.max(...STANCE_OPTIONS.map((stance) => stance.wheelInset));
export const FRONT_WELL_INNER_X = CAR_GEOMETRY.halfTrack - MAX_WHEEL_INSET
  - CAR_GEOMETRY.tireHalfWidth * Math.cos(CAR_GEOMETRY.maxSteerAngle)
  - CAR_GEOMETRY.tireRadius * Math.sin(CAR_GEOMETRY.maxSteerAngle)
  - CAR_GEOMETRY.wheelWellMargin;

export interface CarView {
  car: THREE.Group;
  carVisual: THREE.Group;
  bodyShell: THREE.Group;
  frontWheels: THREE.Group[];
  allWheels: THREE.Group[];
  wheelPivots: THREE.Group[];
  paintMaterial: THREE.MeshStandardMaterial;
  wheelMaterial: THREE.MeshStandardMaterial;
}

// Every mesh carries its own name. Identifying a panel by its dimensions and
// position is possible but slow; `__ns.pick(x, y)` should be able to say "hood".
function part(name: string, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

export function createCar(): CarView {
  const car = new THREE.Group();
  const carVisual = new THREE.Group();
  const bodyShell = new THREE.Group();
  car.add(carVisual);
  carVisual.add(bodyShell);

  // --- Materials ---
  const paintMaterial = new THREE.MeshStandardMaterial({
    color: PAINT_OPTIONS[0]!.color,
    roughness: PAINT_OPTIONS[0]!.roughness,
    metalness: PAINT_OPTIONS[0]!.metalness,
    flatShading: true,
  });
  const darkAero = new THREE.MeshStandardMaterial({
    color: 0x0a0c10,
    roughness: 0.65,
    metalness: 0.25,
    flatShading: true,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x141820,
    roughness: 0.4,
    metalness: 0.5,
    flatShading: true,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x081018,
    roughness: 0.12,
    metalness: 0.85,
    transparent: true,
    opacity: 0.78,
  });
  const interiorSeat = new THREE.MeshStandardMaterial({
    color: 0x947452,
    roughness: 0.78,
    metalness: 0.05,
    flatShading: true,
  });
  const interiorDark = new THREE.MeshStandardMaterial({
    color: 0x101318,
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true,
  });
  const tireMaterial = new THREE.MeshStandardMaterial({
    color: 0x07080a,
    roughness: 0.82,
    metalness: 0.05,
  });
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x252a31,
    roughness: 0.3,
    metalness: 0.88,
  });
  const rimLipMaterial = new THREE.MeshStandardMaterial({
    color: 0xdce2ec,
    roughness: 0.18,
    metalness: 0.95,
  });
  const exhaustMaterial = new THREE.MeshStandardMaterial({
    color: 0xd0d8e0,
    roughness: 0.22,
    metalness: 0.95,
  });

  // Emissive light materials
  const scannerMaterial = new THREE.MeshBasicMaterial({ color: 0xff1024, toneMapped: false });
  const fogMaterial = new THREE.MeshBasicMaterial({ color: 0xfffae0, toneMapped: false });
  const tailMaterial = new THREE.MeshBasicMaterial({ color: 0xff1428, toneMapped: false });
  const tailDark = new THREE.MeshStandardMaterial({ color: 0x140507, roughness: 0.35, metalness: 0.4 });
  const markerAmber = new THREE.MeshBasicMaterial({ color: 0xff9400, toneMapped: false });
  const markerRed = new THREE.MeshBasicMaterial({ color: 0xff1e00, toneMapped: false });

  // --- Chassis & Underbody ---
  // Only the front axle needs the narrower channel; keep the cabin/rear floor.
  const frontWellHalfLength = 0.46;
  const frontWellFront = -CAR_GEOMETRY.axleZ - frontWellHalfLength;
  const frontWellRear = -CAR_GEOMETRY.axleZ + frontWellHalfLength;
  for (const [width, start, end] of [
    [1.50, -2.025, frontWellFront],
    [FRONT_WELL_INNER_X * 2, frontWellFront, frontWellRear],
    [1.50, frontWellRear, 2.025],
  ]) {
    const bellyPan = part("floor-pan", new THREE.BoxGeometry(width, 0.12, end! - start!), darkAero);
    bellyPan.position.set(0, 0.26, (start! + end!) * 0.5);
    bellyPan.castShadow = true;
    bodyShell.add(bellyPan);
  }

  // Inner wheel well liners (prevents seeing through the car)
  for (const z of [-CAR_GEOMETRY.axleZ, CAR_GEOMETRY.axleZ]) {
    const linerOuterX = z < 0 ? FRONT_WELL_INNER_X : 0.75;
    for (const side of [-1, 1]) {
      // Must reach the top of the arch opening, not just the top of the tyre,
      // or the gap you deliberately left above the wheel looks into the cabin.
      const wellLiner = part(
        z < 0 ? "front-inner-liner" : "rear-inner-liner",
        new THREE.BoxGeometry(0.12, 0.60, 0.82),
        darkAero,
      );
      wellLiner.position.set(side * (linerOuterX - 0.06), 0.63, z);
      bodyShell.add(wellLiner);
    }
  }

  // An arch is an arc over the tyre, not a plank through it. The inner radius is
  // what the tyre actually sees, so lowering the shell eats the gap rather than
  // the paint.
  const ARCH_THICKNESS = 0.1;
  const ARCH_RIBS = 7;
  const ARCH_SWEEP_DEGREES = 150;
  function addWheelArch(sideX: number, axleZ: number, panelWidth: number): void {
    const midRadius = ARCH_INNER_RADIUS + ARCH_THICKNESS * 0.5;
    const stepDegrees = ARCH_SWEEP_DEGREES / (ARCH_RIBS - 1);
    // Overlap adjacent ribs slightly so the faceted arch reads as one panel.
    const ribLength = 2 * midRadius * Math.sin(THREE.MathUtils.degToRad(stepDegrees) * 0.5) + 0.02;
    for (let rib = 0; rib < ARCH_RIBS; rib++) {
      const angle = THREE.MathUtils.degToRad(-ARCH_SWEEP_DEGREES * 0.5 + rib * stepDegrees);
      const panel = part(`${axleZ < 0 ? "front" : "rear"}-arch-rib-${rib}`,
        new THREE.BoxGeometry(panelWidth, ARCH_THICKNESS, ribLength),
        paintMaterial,
      );
      panel.position.set(
        sideX,
        CAR_GEOMETRY.wheelCenterY + midRadius * Math.cos(angle),
        axleZ + midRadius * Math.sin(angle),
      );
      panel.rotation.x = angle;
      panel.castShadow = true;
      bodyShell.add(panel);
    }
  }

  // --- Side Rockers & Doors ---
  for (const side of [-1, 1]) {
    // Dark lower rocker skirt
    const skirt = part("skirt", new THREE.BoxGeometry(0.12, 0.14, 1.84), darkAero);
    skirt.position.set(side * 0.91, 0.32, 0);
    skirt.castShadow = true;
    bodyShell.add(skirt);

    // Body-colored door section between wheel arches. The top edge has to reach
    // the glass; anything less leaves a slot straight into the cabin.
    const door = part("door", new THREE.BoxGeometry(0.14, 0.48, 1.84), paintMaterial);
    door.position.set(side * 0.90, 0.63, 0);
    door.castShadow = true;
    bodyShell.add(door);

    // Beltline shelf closing the step from door skin out to the inset glass.
    // Matte, not metallic: a half-metal upward-facing strip blows out to a
    // white slab under the garage key light.
    const beltline = part("beltline", new THREE.BoxGeometry(0.26, 0.05, 1.74), darkAero);
    beltline.position.set(side * 0.86, 0.855, 0);
    beltline.castShadow = true;
    bodyShell.add(beltline);

    // Front fender section (ahead of front wheel)
    const frontFender = part("front-fender", new THREE.BoxGeometry(0.16, 0.36, 0.36), paintMaterial);
    frontFender.position.set(side * 0.90, 0.57, -1.96);
    frontFender.castShadow = true;
    bodyShell.add(frontFender);

    addWheelArch(side * (1 + FRONT_WELL_INNER_X) * 0.5, -CAR_GEOMETRY.axleZ, 1 - FRONT_WELL_INNER_X);

    // Rear fender quarter panel (muscular wide hip)
    const rearQuarter = part("rear-quarter", new THREE.BoxGeometry(0.18, 0.38, 0.42), paintMaterial);
    rearQuarter.position.set(side * 0.93, 0.59, 1.94);
    rearQuarter.castShadow = true;
    bodyShell.add(rearQuarter);

    addWheelArch(side * 0.865, CAR_GEOMETRY.axleZ, 0.33);

    // Side marker lights
    const frontMarker = part("front-marker", new THREE.BoxGeometry(0.04, 0.04, 0.12), markerAmber);
    frontMarker.position.set(side * 0.985, 0.54, -1.98);
    bodyShell.add(frontMarker);

    const rearMarker = part("rear-marker", new THREE.BoxGeometry(0.04, 0.04, 0.12), markerRed);
    rearMarker.position.set(side * 1.015, 0.60, 1.96);
    bodyShell.add(rearMarker);

    // Sleek angular side mirror wedges
    const mirror = part("mirror", new THREE.BoxGeometry(0.18, 0.08, 0.12), darkAero);
    mirror.position.set(side * 0.86, 0.88, -0.58);
    mirror.rotation.y = side * -0.15;
    bodyShell.add(mirror);
  }

  // --- Sloping Wedge Hood & Cowl ---
  // Main sloping hood deck
  const hood = part("hood", new THREE.BoxGeometry(FRONT_WELL_INNER_X * 2, 0.08, 1.54), paintMaterial);
  hood.position.set(0, 0.70, -1.41);
  hood.rotation.x = -0.198; // ~11.3 degree rake down toward nose
  hood.castShadow = true;
  bodyShell.add(hood);

  // Cowl induction scoop on driver side
  const cowlScoop = part("cowl-scoop", new THREE.BoxGeometry(0.34, 0.06, 0.86), paintMaterial);
  cowlScoop.position.set(-0.36, 0.77, -1.24);
  cowlScoop.rotation.x = -0.198;
  cowlScoop.castShadow = true;
  bodyShell.add(cowlScoop);

  const cowlVent = part("cowl-vent", new THREE.BoxGeometry(0.30, 0.04, 0.04), darkAero);
  cowlVent.position.set(-0.36, 0.84, -0.80);
  bodyShell.add(cowlVent);

  // Pop-up headlight covers (recessed outline)
  const headlightCoverX = FRONT_WELL_INNER_X - 0.21;
  for (const x of [-headlightCoverX, headlightCoverX]) {
    const popupCover = part("popup-cover", new THREE.BoxGeometry(0.38, 0.015, 0.38), paintMaterial);
    popupCover.position.set(x, 0.67, -1.82);
    popupCover.rotation.x = -0.198;
    bodyShell.add(popupCover);

    const popupBezel = part("popup-bezel", new THREE.BoxGeometry(0.40, 0.01, 0.40), trimMaterial);
    popupBezel.position.set(x, 0.665, -1.82);
    popupBezel.rotation.x = -0.198;
    bodyShell.add(popupBezel);
  }

  // --- Front Nose & Bumper Valance ---
  // Aerodynamic pointed wedge beak (split into angled left/right prow)
  for (const side of [-1, 1]) {
    const prow = part("prow", new THREE.BoxGeometry(0.86, 0.22, 0.22), paintMaterial);
    prow.position.set(side * 0.43, 0.55, -2.18);
    prow.rotation.y = side * 0.085; // angled forward to create center prow
    prow.castShadow = true;
    bodyShell.add(prow);
  }

  // Signature Glowing Red Nose Scanner Slit (The K.I.T.T. Calling Card)
  const scannerSlot = part("scanner-slot", new THREE.BoxGeometry(0.56, 0.05, 0.08), darkAero);
  scannerSlot.position.set(0, 0.56, -2.26);
  bodyShell.add(scannerSlot);

  const scannerBlade = part("scanner-blade", new THREE.BoxGeometry(0.50, 0.024, 0.04), scannerMaterial);
  scannerBlade.position.set(0, 0.56, -2.285);
  bodyShell.add(scannerBlade);

  const scannerGlow = new THREE.PointLight(0xff1525, 3.5, 3.2, 2);
  scannerGlow.position.set(0, 0.56, -2.35);
  bodyShell.add(scannerGlow);

  // Lower front chin splitter
  const chinSplitter = part("chin-splitter", new THREE.BoxGeometry(1.82, 0.06, 0.32), darkAero);
  chinSplitter.position.set(0, 0.27, -2.12);
  chinSplitter.castShadow = true;
  bodyShell.add(chinSplitter);

  // Lower air dam with quad recessed fog/driving lamps
  const lowerAirDam = part("lower-air-dam", new THREE.BoxGeometry(1.52, 0.14, 0.16), darkAero);
  lowerAirDam.position.set(0, 0.37, -2.16);
  bodyShell.add(lowerAirDam);

  for (const x of [-0.52, -0.32, 0.32, 0.52]) {
    const fogLamp = part("fog-lamp", new THREE.BoxGeometry(0.14, 0.08, 0.03), fogMaterial);
    fogLamp.position.set(x, 0.37, -2.24);
    bodyShell.add(fogLamp);
  }

  // Main high-beam driving spotlight
  const headlight = new THREE.SpotLight(0xd8f7ff, 44, 52, 0.47, 0.72, 1.2);
  headlight.position.set(0, 0.78, -1.7);
  headlight.target.position.set(0, 0.05, -28);
  car.add(headlight, headlight.target);

  // --- T-Top Fastback Greenhouse & Interior ---
  // Interior floor & tub
  const floorTub = part("floor-tub", new THREE.BoxGeometry(1.44, 0.06, 1.76), interiorDark);
  floorTub.position.set(0, 0.38, 0.18);
  bodyShell.add(floorTub);

  // Dashboard & instrument binnacle
  const dash = part("dash", new THREE.BoxGeometry(1.36, 0.22, 0.38), interiorDark);
  dash.position.set(0, 0.74, -0.52);
  dash.castShadow = true;
  bodyShell.add(dash);

  // Low-poly sport steering wheel
  const wheelHub = part("wheel-hub", new THREE.BoxGeometry(0.18, 0.18, 0.04), interiorDark);
  wheelHub.position.set(-0.36, 0.82, -0.38);
  wheelHub.rotation.x = 0.32;
  bodyShell.add(wheelHub);

  // Sculpted low-poly tan bucket seats (visible through tinted glass)
  for (const side of [-1, 1]) {
    const seatBase = part("seat-base", new THREE.BoxGeometry(0.42, 0.14, 0.44), interiorSeat);
    seatBase.position.set(side * 0.36, 0.48, 0.08);
    bodyShell.add(seatBase);

    const seatBack = part("seat-back", new THREE.BoxGeometry(0.40, 0.46, 0.12), interiorSeat);
    seatBack.position.set(side * 0.36, 0.76, 0.32);
    seatBack.rotation.x = 0.16; // reclined sport angle
    seatBack.castShadow = true;
    bodyShell.add(seatBack);

    const headrest = part("headrest", new THREE.BoxGeometry(0.24, 0.14, 0.10), interiorSeat);
    headrest.position.set(side * 0.36, 1.02, 0.38);
    headrest.rotation.x = 0.16;
    bodyShell.add(headrest);
  }

  // Raked Windshield (tapered tumblehome)
  const windshield = part("windshield", new THREE.BoxGeometry(1.42, 0.04, 0.68), glass);
  windshield.position.set(0, 1.04, -0.38);
  // Front is -Z: the lower edge meets the cowl and the rear edge meets the roof.
  windshield.rotation.x = -0.64; // ~36.6 degree rake
  windshield.castShadow = true;
  bodyShell.add(windshield);

  // A-pillars
  for (const side of [-1, 1]) {
    const aPillar = part("a-pillar", new THREE.BoxGeometry(0.06, 0.06, 0.70), trimMaterial);
    aPillar.position.set(side * 0.68, 1.04, -0.38);
    aPillar.rotation.x = -0.64;
    aPillar.rotation.y = side * -0.12;
    bodyShell.add(aPillar);
  }

  // T-Top Roof: Center spine in body paint, glass removable panels
  const tTopSpine = part("t-top-spine", new THREE.BoxGeometry(0.18, 0.05, 0.58), paintMaterial);
  tTopSpine.position.set(0, 1.23, 0.18);
  tTopSpine.castShadow = true;
  bodyShell.add(tTopSpine);

  const roofFrontHeader = part("roof-front-header", new THREE.BoxGeometry(1.32, 0.05, 0.08), trimMaterial);
  roofFrontHeader.position.set(0, 1.23, -0.10);
  bodyShell.add(roofFrontHeader);

  const roofRearBarch = part("roof-rear-barch", new THREE.BoxGeometry(1.36, 0.06, 0.10), paintMaterial);
  roofRearBarch.position.set(0, 1.22, 0.46);
  roofRearBarch.castShadow = true;
  bodyShell.add(roofRearBarch);

  // Longitudinal roof rails. A T-top needs them structurally, and without them
  // the door glass never meets the roof and the panels float on open air.
  for (const side of [-1, 1]) {
    const roofRail = part("roof-rail", new THREE.BoxGeometry(0.16, 0.07, 0.68), paintMaterial);
    roofRail.position.set(side * 0.68, 1.215, 0.185);
    roofRail.castShadow = true;
    bodyShell.add(roofRail);
  }

  // Tinted T-Top glass roof panels
  for (const side of [-1, 1]) {
    const tGlass = part("t-glass", new THREE.BoxGeometry(0.54, 0.03, 0.50), glass);
    tGlass.position.set(side * 0.355, 1.23, 0.18);
    bodyShell.add(tGlass);
  }

  // Fastback Rear Glass Hatch (sloping from roof down to rear deck)
  const rearHatch = part("rear-hatch", new THREE.BoxGeometry(1.32, 0.04, 1.10), glass);
  rearHatch.position.set(0, 1.03, 0.96);
  rearHatch.rotation.x = 0.34; // ~19.5 degree fastback slope
  rearHatch.castShadow = true;
  bodyShell.add(rearHatch);

  // Triangular B/C-pillar Sail Panels (classic 3rd-gen F-body fastback silhouette)
  for (const side of [-1, 1]) {
    const sailPanel = part("sail-panel", new THREE.BoxGeometry(0.12, 0.40, 0.72), paintMaterial);
    sailPanel.position.set(side * 0.74, 1.01, 0.75);
    sailPanel.rotation.x = 0.32;
    sailPanel.rotation.y = side * -0.10;
    sailPanel.castShadow = true;
    bodyShell.add(sailPanel);

    // Side door glass
    const sideGlass = part("side-glass", new THREE.BoxGeometry(0.03, 0.32, 0.74), glass);
    sideGlass.position.set(side * 0.74, 1.03, 0.02);
    sideGlass.rotation.z = side * 0.12; // tumblehome tilt
    bodyShell.add(sideGlass);
  }

  // --- Rear Deck, Taillights & Wrap-Around Wing ---
  // Rear decklid surface
  const decklid = part("decklid", new THREE.BoxGeometry(1.50, 0.08, 0.64), paintMaterial);
  decklid.position.set(0, 0.81, 1.76);
  decklid.castShadow = true;
  bodyShell.add(decklid);

  // Wrap-around aerodynamic 3-piece pedestal wing
  const wingBlade = part("wing-blade", new THREE.BoxGeometry(1.92, 0.05, 0.28), paintMaterial);
  wingBlade.position.set(0, 0.94, 2.02);
  wingBlade.castShadow = true;
  bodyShell.add(wingBlade);

  // Center wing pedestal support
  const wingCenterPost = part("wing-center-post", new THREE.BoxGeometry(0.14, 0.14, 0.18), darkAero);
  wingCenterPost.position.set(0, 0.86, 1.98);
  bodyShell.add(wingCenterPost);

  // Side wrap-around wing endplates curving along the rear quarter panels
  for (const side of [-1, 1]) {
    const wingEnd = part("wing-end", new THREE.BoxGeometry(0.08, 0.14, 0.42), paintMaterial);
    wingEnd.position.set(side * 0.92, 0.88, 1.86);
    wingEnd.castShadow = true;
    bodyShell.add(wingEnd);
  }

  // Full-width Smoked Taillight Panel
  const tailHousing = part("tail-housing", new THREE.BoxGeometry(1.76, 0.20, 0.08), tailDark);
  tailHousing.position.set(0, 0.61, 2.12);
  bodyShell.add(tailHousing);

  // Segmented Glowing Taillight Bars
  for (const side of [-1, 1]) {
    const tailBar = part("tail-bar", new THREE.BoxGeometry(0.54, 0.10, 0.02), tailMaterial);
    tailBar.position.set(side * 0.54, 0.61, 2.165);
    bodyShell.add(tailBar);
  }
  const centerTailStrip = part("center-tail-strip", new THREE.BoxGeometry(0.36, 0.03, 0.02), tailMaterial);
  centerTailStrip.position.set(0, 0.64, 2.165);
  bodyShell.add(centerTailStrip);

  const licenseRecess = part("license-recess", new THREE.BoxGeometry(0.38, 0.08, 0.02), darkAero);
  licenseRecess.position.set(0, 0.56, 2.165);
  bodyShell.add(licenseRecess);

  const tailGlow = new THREE.PointLight(0xff0d20, 2.2, 2.8, 2);
  tailGlow.position.set(0, 0.61, 2.26);
  bodyShell.add(tailGlow);

  // Lower rear diffuser & bumper
  const rearDiffuser = part("rear-diffuser", new THREE.BoxGeometry(1.78, 0.16, 0.24), darkAero);
  rearDiffuser.position.set(0, 0.38, 2.06);
  rearDiffuser.castShadow = true;
  bodyShell.add(rearDiffuser);

  // Dual twin polished chrome exhaust tips (ready for Surge / backfire pops)
  for (const side of [-1, 1]) {
    const tip = part("tip", new THREE.CylinderGeometry(0.042, 0.042, 0.22, 12), exhaustMaterial);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(side * 0.52, 0.33, 2.18);
    tip.castShadow = true;

    // Dark inner bore
    const innerBore = part("inner-bore", new THREE.CylinderGeometry(0.032, 0.032, 0.03, 10), darkAero);
    innerBore.rotation.x = Math.PI / 2;
    innerBore.position.set(side * 0.52, 0.33, 2.28);

    bodyShell.add(tip, innerBore);
  }

  // --- Deep-Dish Wheels with Polished Outer Lip & Turbocast Inner Dish ---
  const frontWheels: THREE.Group[] = [];
  const allWheels: THREE.Group[] = [];
  const wheelPivots: THREE.Group[] = [];

  for (const z of [-CAR_GEOMETRY.axleZ, CAR_GEOMETRY.axleZ]) {
    for (const x of [-1, 1]) {
      const corner = `${z < 0 ? "front" : "rear"}-${x < 0 ? "left" : "right"}`;
      const pivot = new THREE.Group();
      pivot.name = `wheel-${corner}`;
      pivot.position.set(x * CAR_GEOMETRY.halfTrack, CAR_GEOMETRY.wheelCenterY, z);

      const wheel = new THREE.Group();

      // Outer Rubber Tire
      const tire = part("tire",
        new THREE.CylinderGeometry(
          CAR_GEOMETRY.tireRadius,
          CAR_GEOMETRY.tireRadius,
          CAR_GEOMETRY.tireHalfWidth * 2,
          16,
        ),
        tireMaterial,
      );
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;

      // The rim stack is wider than the tyre so the dish reads as deep. That
      // extra width belongs outboard; letting it grow inward would push the
      // wheel through the floor pan once a low stance insets the track.
      const outboard = (halfWidth: number) => x * (halfWidth - CAR_GEOMETRY.tireHalfWidth);

      // Bright Polished Silver Rim Lip
      const rimLip = part("rim-lip", new THREE.CylinderGeometry(0.24, 0.24, 0.265, 16), rimLipMaterial);
      rimLip.rotation.z = Math.PI / 2;
      rimLip.position.x = outboard(0.1325);
      rimLip.castShadow = true;

      // Deep Recessed Turbocast Center Dish (responds to customization)
      const dish = part("dish", new THREE.CylinderGeometry(0.20, 0.20, 0.276, 12), wheelMaterial);
      dish.rotation.z = Math.PI / 2;
      dish.position.x = outboard(0.138);
      dish.castShadow = true;

      // Center Hub Cap
      const hubCap = part("hub-cap", new THREE.CylinderGeometry(0.07, 0.07, 0.285, 8), darkAero);
      hubCap.rotation.z = Math.PI / 2;
      hubCap.position.x = outboard(0.1425);

      for (const piece of [tire, rimLip, dish, hubCap]) piece.name = `${piece.name}-${corner}`;
      wheel.add(tire, rimLip, dish, hubCap);
      pivot.add(wheel);
      carVisual.add(pivot);

      allWheels.push(wheel);
      wheelPivots.push(pivot);
      if (z < 0) frontWheels.push(pivot);
    }
  }

  disambiguateNames(bodyShell);

  return {
    car,
    carVisual,
    bodyShell,
    frontWheels,
    allWheels,
    wheelPivots,
    paintMaterial,
    wheelMaterial,
  };
}

// Mirrored panels are built in a -1/+1 loop, so several meshes arrive sharing a
// name. Suffix them by side, then by index if a side still holds more than one,
// so a pick result always names exactly one mesh.
function disambiguateNames(root: THREE.Object3D): void {
  const byName = new Map<string, THREE.Mesh[]>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    byName.set(mesh.name, [...(byName.get(mesh.name) ?? []), mesh]);
  });
  for (const shared of byName.values()) {
    if (shared.length < 2) continue;
    for (const mesh of shared) {
      if (Math.abs(mesh.position.x) < 0.01) continue;
      mesh.name += mesh.position.x < 0 ? "-left" : "-right";
    }
    const bySide = new Map<string, THREE.Mesh[]>();
    for (const mesh of shared) bySide.set(mesh.name, [...(bySide.get(mesh.name) ?? []), mesh]);
    for (const stillShared of bySide.values()) {
      if (stillShared.length < 2) continue;
      stillShared.forEach((mesh, index) => { mesh.name += `-${index}`; });
    }
  }
}

export function applyCarCustomization(
  car: CarView,
  customization: CarCustomization,
): void {
  const paint = PAINT_OPTIONS.find((option) => option.id === customization.paint) ?? PAINT_OPTIONS[0]!;
  car.paintMaterial.color.setHex(paint.color);
  car.paintMaterial.roughness = paint.roughness;
  car.paintMaterial.metalness = paint.metalness;

  const wheels = WHEEL_OPTIONS.find((option) => option.id === customization.wheels) ?? WHEEL_OPTIONS[0]!;
  car.wheelMaterial.color.setHex(wheels.color);
  car.wheelMaterial.roughness = wheels.roughness;
  car.wheelMaterial.metalness = wheels.metalness;

  const stance = STANCE_OPTIONS.find((option) => option.id === customization.stance) ?? STANCE_OPTIONS[0]!;
  car.bodyShell.position.y = stance.bodyOffset;
  car.wheelPivots.forEach((pivot) => {
    // Lower setups tuck the wheel faces behind the fender skin. The wheel
    // centers stay at road height, so this remains a presentation-only change.
    pivot.position.x = Math.sign(pivot.position.x) * (CAR_GEOMETRY.halfTrack - stance.wheelInset);
  });
}
