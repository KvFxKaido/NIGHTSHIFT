class_name WorkshopControls
extends RefCounted

static func setup() -> void:
	_add("accelerate", [KEY_W, KEY_UP], [], JOY_AXIS_TRIGGER_RIGHT, 1.0)
	_add("brake", [KEY_S, KEY_DOWN], [], JOY_AXIS_TRIGGER_LEFT, 1.0)
	_add("steer_left", [KEY_A, KEY_LEFT], [JOY_BUTTON_DPAD_LEFT], JOY_AXIS_LEFT_X, -1.0)
	_add("steer_right", [KEY_D, KEY_RIGHT], [JOY_BUTTON_DPAD_RIGHT], JOY_AXIS_LEFT_X, 1.0)
	_add("handbrake", [KEY_SPACE], [JOY_BUTTON_A])
	_add("recenter", [KEY_C], [JOY_BUTTON_RIGHT_STICK])
	_add("reset_car", [KEY_R], [JOY_BUTTON_Y])
	_add("pause_game", [KEY_ESCAPE], [JOY_BUTTON_START])
	_add("garage_toggle", [KEY_G], [JOY_BUTTON_BACK])
	_add("camera_left", [], [], JOY_AXIS_RIGHT_X, -1.0)
	_add("camera_right", [], [], JOY_AXIS_RIGHT_X, 1.0)
	_add("camera_up", [], [], JOY_AXIS_RIGHT_Y, -1.0)
	_add("camera_down", [], [], JOY_AXIS_RIGHT_Y, 1.0)
	# Retain Godot's built-in D-pad/keyboard UI actions and add the left stick.
	for spec in [["ui_left", JOY_AXIS_LEFT_X, -1.0], ["ui_right", JOY_AXIS_LEFT_X, 1.0],
		["ui_up", JOY_AXIS_LEFT_Y, -1.0], ["ui_down", JOY_AXIS_LEFT_Y, 1.0]]:
		var event := InputEventJoypadMotion.new()
		event.axis = spec[1]
		event.axis_value = spec[2]
		InputMap.action_add_event(spec[0], event)
		InputMap.action_set_deadzone(spec[0], 0.5)

static func _add(action: String, keys: Array, buttons: Array, axis: int = -1, axis_value: float = 1.0) -> void:
	if InputMap.has_action(action):
		return
	InputMap.add_action(action, 0.16)
	for key in keys:
		var event := InputEventKey.new()
		event.physical_keycode = key
		InputMap.action_add_event(action, event)
	for button in buttons:
		var event := InputEventJoypadButton.new()
		event.button_index = button
		InputMap.action_add_event(action, event)
	if axis >= 0:
		var event := InputEventJoypadMotion.new()
		event.axis = axis
		event.axis_value = axis_value
		InputMap.action_add_event(action, event)

static func driving_input() -> Vector4:
	return Vector4(Input.get_action_strength("accelerate"), Input.get_action_strength("brake"),
		Input.get_axis("steer_left", "steer_right"), Input.get_action_strength("handbrake"))

static func camera_input() -> Vector2:
	return Input.get_vector("camera_left", "camera_right", "camera_up", "camera_down", 0.18)
