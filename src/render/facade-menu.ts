import * as THREE from "three";
import { GARAGE_MENU_DEPTH } from "../sim/garage-site.ts";

interface MenuRow {
  button: HTMLButtonElement;
  top: number;
}

/** The DOM owns actions, focus and accessibility. This adapter paints those
 * same controls on the building and projects their pointer targets back out. */
export function createFacadeMenu(building: THREE.Object3D) {
  const screen = document.querySelector<HTMLElement>('[data-menu-screen="main"]')!;
  const garageSign = building.getObjectByName("district-garage-sign");
  const buttons = [...screen.querySelectorAll<HTMLButtonElement>("button")];
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 800;
  const context = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  panel.name = "wharf-menu-projection";
  panel.rotation.y = Math.PI;
  const menuZ = (building.userData.facadeFront ?? -12) - GARAGE_MENU_DEPTH;
  panel.position.set(-7, 5.5, menuZ);
  building.add(panel);

  const titleCanvas = document.createElement("canvas");
  titleCanvas.width = 1024;
  titleCanvas.height = 512;
  const titleContext = titleCanvas.getContext("2d")!;
  titleContext.fillStyle = "#e4f0e9";
  titleContext.font = "900 218px Impact, sans-serif";
  titleContext.fillText("NIGHT", 30, 215);
  titleContext.fillStyle = "#75dfff";
  titleContext.fillText("SHIFT", 30, 425);
  titleContext.font = "24px monospace";
  titleContext.fillText("PORT ALDER / AFTER DARK", 40, 485);
  const titleTexture = new THREE.CanvasTexture(titleCanvas);
  titleTexture.colorSpace = THREE.SRGBColorSpace;
  const title = new THREE.Mesh(new THREE.PlaneGeometry(10, 5),
    new THREE.MeshBasicMaterial({ map: titleTexture, transparent: true, depthWrite: false, toneMapped: false }));
  title.name = "wharf-nightshift-projection";
  title.rotation.y = Math.PI;
  title.position.set(8, 5.4, menuZ);
  building.add(title);

  // Presentation lights only. Their group is hidden when driving resumes.
  const lights = new THREE.Group();
  lights.name = "wharf-menu-lights";
  const key = new THREE.PointLight(0xffd5ab, 150, 32, 1.5);
  key.position.set(2, 7, -20);
  const rim = new THREE.PointLight(0x75dfff, 100, 24, 1.6);
  rim.position.set(-8, 3, -17);
  lights.add(key, rim);
  building.add(lights);

  let rows: MenuRow[] = [];
  let lastSignature = "";
  let active = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const corner = new THREE.Vector3();
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();

  for (const button of buttons) {
    button.addEventListener("pointerenter", event => {
      if (active && event.pointerType !== "touch" && !button.disabled) button.focus({ preventScroll: true });
    });
  }

  function paint(portrait: boolean): void {
    const visible = buttons.filter(button => !button.hidden);
    const selected = document.activeElement;
    const signature = JSON.stringify([portrait, visible.map(button => [button.textContent, button.disabled, button === selected])]);
    if (signature === lastSignature) return;
    lastSignature = signature;
    context.clearRect(0, 0, 1024, 800);
    context.fillStyle = "rgba(6, 16, 22, .84)";
    context.fillRect(0, 0, 1024, 800);
    context.fillStyle = "#75dfff";
    context.font = "700 24px monospace";
    context.fillText("WHARF GARAGE / 01", 54, 50);
    context.fillStyle = "#e4f0e9";
    context.font = "900 62px Impact, sans-serif";
    context.fillText(portrait ? "NIGHTSHIFT" : "AFTER HOURS", 50, 119);
    rows = visible.map((button, index) => ({ button, top: 151 + index * 85 }));
    for (const { button, top } of rows) {
      const focused = button === selected;
      if (focused) {
        context.fillStyle = "#75dfff";
        context.fillRect(32, top, 960, 76);
      }
      context.fillStyle = button.disabled ? "#6c8087" : focused ? "#09171c" : "#dce8e4";
      context.font = "700 23px monospace";
      context.fillText(String(rows.findIndex(row => row.button === button) + 1).padStart(2, "0"), 55, top + 48);
      context.font = "700 48px sans-serif";
      context.fillText((button.textContent ?? "").toUpperCase(), 126, top + 54, 820);
      if (!focused) {
        context.fillStyle = "rgba(117, 223, 255, .2)";
        context.fillRect(54, top + 77, 914, 1);
      }
    }
    texture.needsUpdate = true;
  }

  function setActive(next: boolean): void {
    active = next;
    screen.dataset.projectionReady = "false";
    panel.visible = title.visible = lights.visible = next;
    if (garageSign) garageSign.visible = !next;
    document.body.classList.toggle("facade-menu", next);
    if (!next) for (const button of buttons) button.removeAttribute("style");
  }
  setActive(false);

  return {
    setActive,
    prefersReducedMotion: () => reducedMotion.matches,
    /** Authored camera rail, in garage-local coordinates. Never moves the sim. */
    frame(camera: THREE.PerspectiveCamera, cameraPosition: THREE.Vector3, cameraTarget: THREE.Vector3,
      delta: number, snap = false): void {
      const portrait = innerWidth / innerHeight < .9;
      const selectedIndex = Math.max(0, rows.findIndex(row => row.button === document.activeElement));
      const shift = reducedMotion.matches ? 0 : selectedIndex * .1;
      position.set(portrait ? 0 : 3 + shift, portrait ? 6 : 6.5, portrait ? -34 : -40);
      target.set(portrait ? 0 : 1 + shift, portrait ? 4.6 : 4.2, -12);
      building.localToWorld(position);
      building.localToWorld(target);
      const blend = snap || reducedMotion.matches ? 1 : 1 - Math.exp(-12 * delta);
      cameraPosition.lerp(position, blend);
      cameraTarget.lerp(target, blend);
      camera.position.copy(cameraPosition);
      camera.lookAt(cameraTarget);
      camera.fov = portrait ? 48 : 45;
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      panel.position.x = portrait ? 0 : -7;
      panel.scale.set(portrait ? 7.2 : 12, 8.8, 1);
      title.visible = !portrait;
      paint(portrait);
      panel.updateWorldMatrix(true, false);

      // Four projected corners also clip each hit region: adjacent rows cannot
      // overlap when the wall is seen obliquely. Focus remains a real button.
      for (const { button, top } of rows) {
        const points = [[32, top], [992, top], [992, top + 76], [32, top + 76]].map(([x, y]) => {
          corner.set(x! / 1024 - .5, .5 - y! / 800, 0).applyMatrix4(panel.matrixWorld).project(camera);
          return [(corner.x + 1) * innerWidth / 2, (1 - corner.y) * innerHeight / 2];
        });
        const left = Math.min(...points.map(p => p[0]!)), right = Math.max(...points.map(p => p[0]!));
        const topEdge = Math.min(...points.map(p => p[1]!)), bottom = Math.max(...points.map(p => p[1]!));
        Object.assign(button.style, {
          left: `${left}px`, top: `${topEdge}px`, width: `${right - left}px`, height: `${bottom - topEdge}px`,
          clipPath: `polygon(${points.map(p => `${p[0]! - left}px ${p[1]! - topEdge}px`).join(",")})`,
        });
      }
      screen.dataset.projectionReady = "true";
    },
  };
}
