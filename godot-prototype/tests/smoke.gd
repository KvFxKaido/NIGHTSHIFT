extends SceneTree
## Run with --headless --path godot-prototype --script res://tests/smoke.gd

var failures: Array[String] = []
var checks: int = 0

func _initialize() -> void:
	_run.call_deferred()

func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)
		push_error(message)

func _run() -> void:
	var config := WorkshopHandling.new()
	var a := WorkshopSim.new()
	var b := WorkshopSim.new()
	for i in range(600):
		var input := Vector4(0.8, 0, sin(i * 0.017) * 0.4, 1.0 if i > 300 and i < 340 else 0.0)
		a.step(input, config)
	for input in a.input_log:
		b.step(input, config)
	check(a.input_log.size() == a.tick, "Each fixed tick must record its canonical input")
	check(a.position == b.position and a.velocity == b.velocity and a.heading == b.heading,
		"Fixed input playback must repeat within this Godot build")
	a.reset()
	check(a.input_log.is_empty(), "Reset must start a new input log")
	for i in range(120):
		a.step(Vector4(0, 0, 1, 0), config)
	check(a.position == Vector2.ZERO and a.heading == 0.0, "Steering at rest must not turn the car")
	a.reset()
	for i in range(120):
		a.step(Vector4(1, 0, 0, 0), config)
	check(a.position.y < -10 and a.velocity.length() > 15, "Throttle must move the car down -Z")
	var speed_before: float = a.velocity.length()
	for i in range(30):
		a.step(Vector4(0, 1, 0, 0), config)
	check(a.velocity.length() < speed_before, "Brake must reduce forward speed")
	a.reset()
	b.reset()
	for i in range(120):
		a.step(Vector4(1, 0, 0.5, 1), config)
		b.step(Vector4(0, 0, 0.5, 1), config)
	check(a.velocity == b.velocity and a.position == b.position, "Handbrake must suppress throttle")
	a.reset()
	b.reset()
	a.velocity = Vector2(0, -22)
	b.velocity = a.velocity
	for i in range(20):
		a.step(Vector4(0, 0, 0.8, 0), config)
		b.step(Vector4(0, 0, 0.8, 1), config)
	check(absf(b.heading) > absf(a.heading), "Handbrake must add rear rotation")

	var scene = load("res://scenes/workshop.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.set_process(false) # Manual input/timing below is deterministic.
	check(scene.garage_mode and not scene.player.driving, "Boot must open garage with simulation stopped")
	check(scene.car.get_node("Visual/FrontLeftPivot/Spin/Tire") is MeshInstance3D, "Car parts must remain editable scene nodes")
	var found_windshield: bool = false
	for mesh in scene.car.find_children("*", "MeshInstance3D", true, false):
		if mesh.position.is_equal_approx(Vector3(0, 1.04, -0.38)):
			found_windshield = true
			check(is_equal_approx(mesh.rotation.x, -0.64), "Transfer must preserve the windshield's rake direction")
	check(found_windshield, "Transferred windshield must exist")
	check(scene.get_node("WorldEnvironment").environment.ambient_light_source == Environment.AMBIENT_SOURCE_COLOR,
		"Ambient lighting must not depend on a missing sky resource")
	scene.car.body_color = Color("4a2378")
	scene.car.stance = 2
	check(is_equal_approx(scene.car.get_node("Visual/BodyShell").position.y, -0.075), "Inspector stance must move the shell")
	scene.get_node("Interface/GaragePanel/Margin/Controls/Drive").pressed.emit()
	check(scene.player.driving and not scene.garage_mode, "Drive button must enter the circuit")
	check(scene.car.stance == 2 and scene.car.body_color == Color("4a2378"), "Customization must survive entering the circuit")
	var spawn: Vector3 = scene.player.position
	scene.player.command = Vector4(1, 0, 0, 0)
	for i in range(90):
		await physics_frame
	check(scene.player.position.z < spawn.z - 5, "Actual scene player must drive with supplied throttle")
	scene.pause_drive()
	var tick: int = scene.player.sim.tick
	for i in range(10):
		await physics_frame
	check(scene.player.sim.tick == tick, "Pause must stop fixed simulation ticks")
	scene.reset_drive()
	check(scene.player.position.distance_to(spawn) < 0.01, "Reset must restore the scene spawn")
	# Aim straight at the outside right-straight wall and ensure contact blocks it.
	scene.player.reset_to(Vector3(45, 0, 10), -PI / 2.0)
	scene.player.command = Vector4(1, 0, 0, 0)
	for i in range(180):
		await physics_frame
	check(scene.player.position.x < 52.2, "Wall contact must contain the car")
	scene.enter_garage()
	check(scene.car.stance == 2 and not scene.player.driving, "Garage return must keep customization and stop driving")
	check(InputMap.action_get_events("handbrake").size() >= 2, "Keyboard and controller actions must be installed")
	scene.queue_free()
	await process_frame
	print("WORKSHOP CHECKS: %d passed, %d failed" % [checks - failures.size(), failures.size()])
	quit(1 if failures.size() > 0 else 0)
