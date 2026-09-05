extends SceneTree
## Asset contract and comparison navigation; run headless at fixed 60 fps.

var checks: int = 0
var failures: int = 0

func _initialize() -> void:
	_run.call_deferred()

func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		push_error(message)

func bounds_of(model: Node3D) -> AABB:
	var bounds := AABB()
	var first: bool = true
	for mesh in model.find_children("*", "MeshInstance3D", true, false):
		var bounds_here: AABB = (model.global_transform.affine_inverse() * mesh.global_transform) * mesh.get_aabb()
		bounds = bounds_here if first else bounds.merge(bounds_here)
		first = false
	return bounds

func _run() -> void:
	var scene = load("res://scenes/workshop.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	var comparison = scene.comparison
	check(not comparison.visible and not scene.comparison_mode, "Comparison must not replace the normal garage at boot")
	check(comparison.reference_car.find_children("*", "MeshInstance3D", true, false).size() == 6,
		"Reference must load body, spoiler, and four wheels")
	check(comparison.find_children("*", "CollisionObject3D", true, false).is_empty(), "Reference bay must be presentation-only")
	var our_bounds: AABB = bounds_of(comparison.get_node("OurTurntable"))
	var reference_bounds: AABB = bounds_of(comparison.get_node("ReferenceTurntable"))
	check(absf(our_bounds.size.z - reference_bounds.size.z) < 0.002, "Overall lengths must match without changing aspect ratios")
	check(absf(our_bounds.position.y) < 0.002 and absf(reference_bounds.position.y) < 0.002,
		"Both cars must sit at their respective plinth ground level")
	var normalized: Node3D = comparison.reference_car.get_node("NormalizedBody")
	check(is_equal_approx(normalized.scale.x, normalized.scale.y) and is_equal_approx(normalized.scale.y, normalized.scale.z),
		"Reference normalization must use uniform scale")
	var front_wheels: Array[Node] = comparison.reference_car.find_children("wheel-front*", "Node3D", true, false)
	check(front_wheels.size() == 2, "Imported wheel names must stay identifiable")
	for wheel: Node3D in front_wheels:
		var local: Vector3 = comparison.reference_car.to_local(wheel.global_position)
		check(local.z < 0, "Reference front must face NIGHTSHIFT -Z")
	for mesh in comparison.reference_car.find_children("*", "MeshInstance3D", true, false):
		var material = mesh.mesh.surface_get_material(0)
		check(material is StandardMaterial3D and material.albedo_texture != null, "Reference palette texture must be packaged and loaded")
	scene.car.stance = 2
	scene.car.body_color = Color("4a2378")
	var authored_color: Color = scene.car._paint.albedo_color
	var authored_material: Material = scene.car.get_node("Visual/BodyShell").get_child(0).material_override
	scene.get_node("Interface/GaragePanel/Margin/Controls/Compare").pressed.emit()
	check(scene.comparison_mode and scene.comparison_ui.visible and not scene.player.driving,
		"Compare button must open the study and stop simulation")
	check(not scene.player.visible and not scene.get_node("Garage").visible and not scene.get_node("Moon").visible,
		"Normal garage and its lights must be hidden during the study")
	check(scene.camera.environment == comparison.environment, "Comparison camera must use the neutral environment")
	scene._update_camera(1.0 / 60.0)
	check(scene.camera.projection == Camera3D.PROJECTION_ORTHOGONAL, "Comparison must remove left/right perspective distortion")
	var mouse_down := InputEventMouseButton.new()
	mouse_down.button_index = MOUSE_BUTTON_RIGHT
	mouse_down.pressed = true
	scene._unhandled_input(mouse_down)
	var mouse_motion := InputEventMouseMotion.new()
	mouse_motion.relative = Vector2(30, -10)
	scene._unhandled_input(mouse_motion)
	scene._update_camera(1.0 / 60.0)
	check(scene.orbit.x != 0 and scene.orbit.y != 0, "Mouse drag must rotate and elevate the comparison")
	mouse_down.pressed = false
	scene._unhandled_input(mouse_down)
	check(not scene._dragging, "Mouse release must stop dragging")
	var angle_before: float = scene.orbit.x
	Input.action_press("camera_right", 0.8)
	scene._update_camera(1.0 / 60.0)
	Input.action_release("camera_right")
	check(scene.orbit.x != angle_before, "The mapped right-stick camera action must rotate the study")
	var tick: int = scene.player.sim.tick
	for i in range(4):
		await physics_frame
	check(scene.player.sim.tick == tick, "Comparison must not tick driving simulation")
	for mesh: MeshInstance3D in comparison._authored_materials:
		check(mesh.material_override == comparison.clay_material, "Both subjects must share one clay material")
	comparison.set_clay(false)
	for mesh: MeshInstance3D in comparison._authored_materials:
		check(mesh.material_override == comparison._authored_materials[mesh], "Material toggle must restore authored overrides")
	comparison.set_clay(true)
	check(scene.car._paint.albedo_color == authored_color and scene.car.stance == 2,
		"Study must not change the driving car's appearance")
	check(scene.car.get_node("Visual/BodyShell").get_child(0).material_override == authored_material,
		"Clay override must not leak into the driving car")
	comparison.set_angle(1.1)
	check(comparison.get_node("OurTurntable").rotation == comparison.get_node("ReferenceTurntable").rotation,
		"Both subjects must rotate together")
	scene.get_node("Interface/ComparisonUI/Actions/Back").pressed.emit()
	check(scene.garage_mode and not scene.comparison_mode and scene.player.visible and scene.camera.environment == null,
		"Back button must restore normal garage, player visibility, and environment")
	check(scene.camera.projection == Camera3D.PROJECTION_PERSPECTIVE, "Leaving the study must restore the normal perspective camera")
	scene.enter_comparison()
	var escape := InputEventKey.new()
	escape.physical_keycode = KEY_ESCAPE
	escape.pressed = true
	scene._unhandled_input(escape)
	check(not scene.comparison_mode and scene.garage_mode, "Unhandled Escape must return to the garage")
	scene.enter_comparison()
	var circle := InputEventJoypadButton.new()
	circle.button_index = JOY_BUTTON_B
	circle.pressed = true
	scene._unhandled_input(circle)
	check(not scene.comparison_mode and scene.garage_mode, "Unhandled controller Circle must return to the garage")
	scene.enter_comparison()
	scene.start_drive()
	check(scene.player.driving and not scene.comparison_mode and not comparison.visible,
		"Driving must never display the reference bay")
	check(scene.car.stance == 2 and scene.car.body_color == authored_color, "Driving after comparison must retain customization")
	scene.queue_free()
	await process_frame
	print("REFERENCE CHECKS: %d passed, %d failed" % [checks - failures, failures])
	quit(0 if failures == 0 else 1)
