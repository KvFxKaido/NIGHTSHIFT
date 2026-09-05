extends Node3D
## Scene/UI coordinator. Driving state lives in WorkshopSim.

@onready var player = $Player
@onready var camera: Camera3D = $Camera
@onready var car = $Player/Car
@onready var garage_panel: PanelContainer = $Interface/GaragePanel
@onready var pause_panel: PanelContainer = $Interface/PausePanel
@onready var paint_choice: OptionButton = $Interface/GaragePanel/Margin/Controls/Paint
@onready var wheel_choice: OptionButton = $Interface/GaragePanel/Margin/Controls/Wheels
@onready var stance_choice: OptionButton = $Interface/GaragePanel/Margin/Controls/Stance
@onready var comparison = $Comparison
@onready var comparison_ui: Control = $Interface/ComparisonUI

var garage_mode: bool = true
var comparison_mode: bool = false
var paused: bool = false
var orbit: Vector2 = Vector2.ZERO
var _camera_initialized: bool = false
var _mouse_orbit: Vector2 = Vector2.ZERO
var _dragging: bool = false

const PAINTS: Array[Color] = [Color("a80d2f"), Color("111722"), Color("c47a18"), Color("d8dde2"), Color("4a2378")]
const ROUGHNESS: Array[float] = [0.34, 0.32, 0.39, 0.36, 0.35]
const METALNESS: Array[float] = [0.18, 0.12, 0.25, 0.1, 0.2]

func _ready() -> void:
	WorkshopControls.setup()
	paint_choice.item_selected.connect(_select_paint)
	wheel_choice.item_selected.connect(_select_wheels)
	stance_choice.item_selected.connect(func(index: int): car.stance = index)
	$Interface/GaragePanel/Margin/Controls/Drive.pressed.connect(start_drive)
	$Interface/GaragePanel/Margin/Controls/Compare.pressed.connect(enter_comparison)
	$Interface/ComparisonUI/Actions/Back.pressed.connect(enter_garage)
	$Interface/ComparisonUI/Actions/Material.item_selected.connect(func(index: int): comparison.set_clay(index == 0))
	$Interface/PausePanel/Margin/Controls/Resume.pressed.connect(resume_drive)
	$Interface/PausePanel/Margin/Controls/Restart.pressed.connect(reset_drive)
	$Interface/PausePanel/Margin/Controls/Garage.pressed.connect(enter_garage)
	enter_garage()

func _process(delta: float) -> void:
	if Input.is_action_just_pressed("garage_toggle"):
		if comparison_mode:
			enter_garage()
		elif garage_mode:
			start_drive()
		else:
			enter_garage()
	if not garage_mode and Input.is_action_just_pressed("pause_game"):
		if paused:
			resume_drive()
		else:
			pause_drive()
	if not garage_mode and not paused and Input.is_action_just_pressed("reset_car"):
		reset_drive()
	if Input.is_action_just_pressed("recenter"):
		orbit = Vector2.ZERO
	player.command = WorkshopControls.driving_input() if player.driving else Vector4.ZERO
	if not paused:
		_update_camera(delta)
	var mph: int = roundi(player.sim.velocity.length() * 2.236936)
	$Interface/Speed.text = "%03d MPH" % mph
	$Interface/Speed.visible = not garage_mode
	$Interface/Mode.text = "GARAGE / BAY 01" if garage_mode else "BLACKGLASS / TEST LOOP"
	$Interface/Hint.text = "RIGHT STICK / RMB DRAG  inspect   ·   R3 / C  recenter   ·   G / SHARE  drive" if garage_mode else \
		"WASD / LEFT STICK  steer   ·   W / R2  gas   ·   S / L2  brake   ·   SPACE / CROSS  handbrake\nESC / OPTIONS  pause   ·   G / SHARE  garage   ·   R / TRIANGLE  reset   ·   RIGHT STICK / RMB  camera"
	if comparison_mode:
		$Interface/Mode.text = "GARAGE / REFERENCE BAY"
		$Interface/Hint.text = "RIGHT STICK / RMB DRAG  rotate both   ·   R3 / C  recenter   ·   ESC / CIRCLE  garage"

func _unhandled_input(event: InputEvent) -> void:
	# A material popup consumes Escape/Circle first; only unhandled back
	# input leaves the reference bay.
	if comparison_mode and event.is_action_pressed("pause_game") and not event.is_echo():
		enter_garage()
		get_viewport().set_input_as_handled()
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT:
		_dragging = event.pressed
	if event is InputEventMouseMotion and _dragging:
		_mouse_orbit += event.relative * 0.006
	if event is InputEventJoypadButton and event.button_index == JOY_BUTTON_B and event.pressed and paused:
		resume_drive()
	elif event is InputEventJoypadButton and event.button_index == JOY_BUTTON_B and event.pressed and comparison_mode:
		enter_garage()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and is_node_ready():
		_dragging = false
		_mouse_orbit = Vector2.ZERO
		if not garage_mode:
			pause_drive()

func enter_garage() -> void:
	_leave_comparison()
	garage_mode = true
	paused = false
	$Garage.visible = true
	$Circuit.visible = false
	garage_panel.show()
	pause_panel.hide()
	player.set_garage_pose(Vector3(0, 0.14, 0))
	orbit = Vector2.ZERO
	_camera_initialized = false
	stance_choice.select(car.stance)
	$Interface/GaragePanel/Margin/Controls/Drive.grab_focus()

func enter_comparison() -> void:
	# Use display-only instances, never relocate or repaint the driving car.
	garage_mode = true
	comparison_mode = true
	paused = false
	player.driving = false
	player.command = Vector4.ZERO
	player.hide()
	$Garage.hide()
	$Circuit.hide()
	$Moon.hide()
	garage_panel.hide()
	pause_panel.hide()
	comparison.show()
	comparison_ui.show()
	camera.environment = comparison.environment
	orbit = Vector2.ZERO
	_mouse_orbit = Vector2.ZERO
	_dragging = false
	_camera_initialized = false
	$Interface/ComparisonUI/Actions/Material.grab_focus()

func _leave_comparison() -> void:
	comparison_mode = false
	comparison.hide()
	comparison_ui.hide()
	player.show()
	$Moon.show()
	camera.environment = null
	camera.projection = Camera3D.PROJECTION_PERSPECTIVE
	_mouse_orbit = Vector2.ZERO
	_dragging = false

func start_drive() -> void:
	_leave_comparison()
	garage_mode = false
	paused = false
	$Garage.visible = false
	$Circuit.visible = true
	garage_panel.hide()
	pause_panel.hide()
	get_viewport().gui_release_focus()
	player.reset_to($Circuit/Spawn.global_position, $Circuit/Spawn.rotation.y)
	player.driving = true
	orbit = Vector2.ZERO
	_camera_initialized = false

func pause_drive() -> void:
	if garage_mode:
		return
	paused = true
	player.driving = false
	player.command = Vector4.ZERO
	pause_panel.show()
	$Interface/PausePanel/Margin/Controls/Resume.grab_focus()

func resume_drive() -> void:
	paused = false
	pause_panel.hide()
	get_viewport().gui_release_focus()
	player.driving = not garage_mode

func reset_drive() -> void:
	player.reset_to($Circuit/Spawn.global_position, $Circuit/Spawn.rotation.y)
	resume_drive()
	orbit = Vector2.ZERO
	_camera_initialized = false

func _select_paint(index: int) -> void:
	car.body_color = PAINTS[index]
	car.paint_roughness = ROUGHNESS[index]
	car.paint_metalness = METALNESS[index]

func _select_wheels(index: int) -> void:
	car.wheel_color = [Color("252a31"), Color("b7c0c8"), Color("d7d5ca")][index]

func _update_camera(delta: float) -> void:
	var look: Vector2 = WorkshopControls.camera_input()
	var speed: float = player.sim.velocity.length()
	if look.length_squared() > 0.001 or _mouse_orbit.length_squared() > 0.0:
		orbit.x = wrapf(orbit.x - look.x * 2.65 * delta - _mouse_orbit.x, -PI, PI)
		orbit.y = clampf(orbit.y - look.y * 1.35 * delta - _mouse_orbit.y, -0.14, 0.48)
	elif not garage_mode and speed > 1.5:
		orbit = orbit.lerp(Vector2.ZERO, 1.0 - exp(-3.2 * delta))
	_mouse_orbit = Vector2.ZERO
	if comparison_mode:
		comparison.set_angle(orbit.x)
		# Fixed horizontal camera: rotating the two turntables keeps one body
		# from hiding behind the other at side/rear inspection angles.
		var screen: Vector2 = get_viewport().get_visible_rect().size
		var aspect: float = screen.x / maxf(screen.y, 1.0)
		# Orthographic projection gives both bodies the same viewing angle
		# and apparent scale, without left/right perspective distortion.
		camera.projection = Camera3D.PROJECTION_ORTHOGONAL
		camera.size = maxf(7.6, 12.6 / aspect)
		camera.global_position = Vector3(0, 4.3 + sin(orbit.y) * 9.0, -12.5)
		camera.look_at(Vector3(0, 0.85, 0))
		_camera_initialized = true
		return
	var ratio: float = clampf(speed / 53.0, 0.0, 1.0)
	var distance: float = 8.2 if garage_mode else 7.2 + ratio * 2.7
	var yaw: float = (PI * 0.75 if garage_mode else player.rotation.y) + orbit.x
	var at: Vector3 = player.global_position
	var camera_target: Vector3 = at + Vector3(0, 0.82, 0)
	var desired: Vector3 = at + Vector3(sin(yaw) * distance * cos(orbit.y),
		(2.75 if garage_mode else 3.15 + ratio * 1.05) + sin(orbit.y) * distance,
		cos(yaw) * distance * cos(orbit.y))
	camera.fov = 48.0 if garage_mode else 62.0 + ratio * 15.0
	if garage_mode:
		var screen: Vector2 = get_viewport().get_visible_rect().size
		var offset: float = distance * tan(deg_to_rad(24.0)) * (screen.x / screen.y) * 340.0 / screen.x
		var right: Vector3 = Vector3(cos(yaw), 0, -sin(yaw))
		desired += right * offset
		camera_target += right * offset
	else:
		camera_target += -player.global_basis.z * (2.6 + ratio * 4.8) * maxf(0.0, cos(orbit.x))
	if _camera_initialized:
		camera.global_position = camera.global_position.lerp(desired, 1.0 - exp(-8.5 * delta))
	else:
		camera.global_position = desired
		_camera_initialized = true
	camera.look_at(camera_target)
