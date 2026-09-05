extends SceneTree
## Exercise a full loop through actual scene collision handling, not teleporting.

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var route: Array = JSON.parse_string(FileAccess.get_file_as_string("res://resources/route.json"))
	var scene = load("res://scenes/workshop.tscn").instantiate()
	root.add_child(scene)
	await physics_frame
	scene.set_process(false)
	scene.start_drive()
	var last_index: int = 4 # Spawn at x45/z55, four samples after the route origin.
	var progress: int = 0
	var worst_distance: float = 0.0
	var steps: int = 0
	for i in range(4500):
		var at: Vector2 = Vector2(scene.player.position.x, scene.player.position.z)
		var nearest: int = last_index
		var distance: float = INF
		for j in range(route.size()):
			var point := Vector2(route[j].x, route[j].z)
			var candidate: float = at.distance_to(point)
			if candidate < distance:
				distance = candidate
				nearest = j
		worst_distance = maxf(worst_distance, distance)
		var advance: int = posmod(nearest - last_index, route.size())
		if advance < 10:
			progress += advance
			last_index = nearest
		var target: Dictionary = route[(nearest + 3) % route.size()]
		var direction: Vector2 = Vector2(target.x, target.z) - at
		var error: float = wrapf(atan2(-direction.x, -direction.y) - scene.player.rotation.y, -PI, PI)
		var speed: float = scene.player.sim.velocity.length()
		var throttle: float = clampf((20.0 - speed) * 0.25 + 0.12, 0.0, 1.0)
		var brake: float = clampf((speed - 22.0) * 0.2, 0.0, 1.0)
		scene.player.command = Vector4(throttle, brake, clampf(-error * 1.8, -1.0, 1.0), 0)
		await physics_frame
		steps = i + 1
		if progress >= route.size():
			break
	var passed: bool = progress >= route.size() and worst_distance < 6.5
	print("DRIVE LOOP: %s; %d/120 route samples; %.2f s; max center-sample distance %.2f m" %
		["PASS" if passed else "FAIL", progress, steps / 60.0, worst_distance])
	scene.queue_free()
	await process_frame
	quit(0 if passed else 1)
