export async function checkFacadeRegressions(page) {
  await page.evaluate(async () => {
    const { render, setViewMode } = await import('/src/render/scene.ts');
    const { updateRaceBeacon } = await import('/src/render/race.ts');
    const { HANDLING } = await import('/src/sim/sim.ts');
    const view = __ns.view, state = __ns.sim.state;
    const screen = document.querySelector('[data-menu-screen="main"]');
    const button = screen.querySelector('[data-menu-action="garage"]');
    const assert = (value, message) => { if (!value) throw Error(message); };
    const near = (a, b) => Math.abs(a - b) < 1e-8;
    const look = { x: 0, y: 0 };
    const draw = view.renderer.render;
    const beaconPosition = view.race.group.position.clone();
    const originalExtras = view.race.extras;
    try {
      view.renderer.render = () => {};
      // Re-entry removes the old geometry. In the same JS task, before any RAF,
      // projected controls must reject pointer input; the first frame enables it.
      setViewMode(view, 'track');
      setViewMode(view, 'main');
      assert(screen.dataset.projectionReady === 'false' && getComputedStyle(button).pointerEvents === 'none',
        'Facade targets accept input before projection');
      render(view, state, 0, look);
      assert(screen.dataset.projectionReady === 'true' && getComputedStyle(button).pointerEvents === 'auto',
        'Projected targets did not become interactive');

      const panel = view.scene.getObjectByName('wharf-menu-projection');
      const version = panel.material.map.version;
      const label = button.textContent;
      button.textContent = 'Garage test label';
      render(view, state, 0, look);
      assert(panel.material.map.version > version, 'Changed label did not repaint');
      button.textContent = label;

      const gates = [{ x: 17, z: 900, exit: null }, { x: 17, z: 930, exit: null }, { x: 17, z: 960, exit: null }];
      const race = { next: gates[0], targets: gates };
      updateRaceBeacon(view.race, race, view.surface, view.camera);
      assert(view.race.extras.length === 2 && view.race.extras.every(extra => extra.group.visible), 'Unordered setup failed');
      render(view, state, 0, look);
      assert(!view.race.group.visible && view.race.extras.every(extra => !extra.group.visible), 'Checkpoint beams leaked into facade');

      // Inspect what is sent to the renderer on the FIRST departure frame.
      // A distant, leaning, steering car distinguishes every reset facade pose.
      const vehicle = { ...state.vehicle, x: 180, y: 8, z: 730, heading: .4, pitch: .1, roll: -.05,
        speed: 14, forwardSpeed: 14, steering: .3,
        wheels: Object.fromEntries(Object.entries(state.vehicle.wheels).map(([id, tyre]) =>
          [id, { ...tyre, steeringAngle: .2, rollingDistance: 5 }])) };
      let drew = false;
      view.renderer.render = () => {
        drew = true;
        assert(view.car.position.equals({ x: vehicle.x, y: vehicle.y, z: vehicle.z }), 'First draw has facade position');
        assert(near(view.car.rotation.y, vehicle.heading) && near(view.car.rotation.x, vehicle.pitch) && near(view.car.rotation.z, vehicle.roll), 'First draw has facade rotation');
        assert(near(view.carVisual.rotation.z, -vehicle.steering * vehicle.speed / HANDLING.topSpeed * .045), 'First draw has facade lean');
        assert(view.wheelPivots.every(wheel => near(wheel.rotation.y, -.2)), 'First draw has facade steering');
        assert(view.allWheels.every(wheel => near(wheel.rotation.x, -5 / HANDLING.wheelRadius)), 'First draw has stale wheel roll');
        assert(view.race.group.visible && view.race.extras.every(extra => extra.group.visible), 'Beacons did not return on departure');
      };
      setViewMode(view, 'track');
      render(view, { ...state, vehicle, race }, 0, look);
      assert(drew, 'Departure never rendered');
    } finally {
      view.renderer.render = draw;
      for (const extra of view.race.extras ?? []) {
        if (!originalExtras?.includes(extra)) extra.group.removeFromParent();
      }
      view.race.extras = originalExtras;
      view.race.group.position.copy(beaconPosition);
      setViewMode(view, 'main');
      render(view, state, 0, look);
    }
  });
}
