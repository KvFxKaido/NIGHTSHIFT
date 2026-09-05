extends SceneTree
## Render actual native-game screenshots, then close the test window.

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var scene = load("res://scenes/workshop.tscn").instantiate()
	root.add_child(scene)
	root.size = Vector2i(1440, 900)
	var directory: String = ProjectSettings.globalize_path("res://artifacts")
	DirAccess.make_dir_recursive_absolute(directory)
	FileAccess.open(directory.path_join(".gdignore"), FileAccess.WRITE).close()
	for i in range(8):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(directory.path_join("garage.png"))
	scene.get_node("Interface/GaragePanel/Margin/Controls/Compare").pressed.emit()
	for i in range(8):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(directory.path_join("reference-clay.png"))
	scene.orbit.x = -1.1
	for i in range(8):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(directory.path_join("reference-side.png"))
	scene.orbit.x = 0.0
	scene.get_node("Interface/ComparisonUI/Actions/Material").select(1)
	scene.get_node("Interface/ComparisonUI/Actions/Material").item_selected.emit(1)
	for i in range(8):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(directory.path_join("reference-materials.png"))
	root.size = Vector2i(960, 600)
	for i in range(8):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(directory.path_join("reference-compact.png"))
	root.size = Vector2i(1440, 900)
	scene.enter_garage()
	scene.stance_choice.select(2)
	scene.stance_choice.item_selected.emit(2)
	scene.paint_choice.select(3)
	scene.paint_choice.item_selected.emit(3)
	scene.orbit.x = 0.75
	for i in range(40):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(directory.path_join("garage-slammed.png"))
	scene.start_drive()
	for i in range(8):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(directory.path_join("circuit.png"))
	scene.player.reset_to(Vector3(45, 0, -32), 0.0)
	scene._camera_initialized = false
	for i in range(8):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(directory.path_join("tunnel.png"))
	print("CAPTURED: garage, reference-clay, reference-side, reference-materials, reference-compact, garage-slammed, circuit, tunnel")
	scene.queue_free()
	await process_frame
	quit()
