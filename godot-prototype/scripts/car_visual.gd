@tool
extends Node3D
## These controls update the editor preview as well as the running car.

@export_group("Appearance")
@export var body_color: Color = Color("a80d2f"):
	set(value):
		body_color = value
		if is_node_ready():
			_apply_appearance()
@export_range(0.05, 1.0, 0.01) var paint_roughness: float = 0.34:
	set(value):
		paint_roughness = value
		if is_node_ready():
			_apply_appearance()
@export_range(0.0, 1.0, 0.01) var paint_metalness: float = 0.18:
	set(value):
		paint_metalness = value
		if is_node_ready():
			_apply_appearance()
@export var wheel_color: Color = Color("252a31"):
	set(value):
		wheel_color = value
		if is_node_ready():
			_apply_appearance()
@export_enum("Street", "Low", "Slammed") var stance: int = 0:
	set(value):
		stance = clampi(value, 0, 2)
		if is_node_ready():
			_apply_stance()

var _paint: StandardMaterial3D
var _wheel_material: StandardMaterial3D
var _spin: float = 0.0

func _ready() -> void:
	# One material instance per car, shared across that car's paint surfaces.
	_paint = load("res://materials/body_paint.tres").duplicate()
	_wheel_material = load("res://materials/wheel_finish.tres").duplicate()
	for node in find_children("*", "MeshInstance3D", true, false):
		var material: Material = node.get_active_material(0)
		if material and material.resource_name == "BodyPaint":
			node.material_override = _paint
		elif material and material.resource_name == "WheelFinish":
			node.material_override = _wheel_material
	_apply_appearance()
	_apply_stance()

func _apply_appearance() -> void:
	if _paint:
		_paint.albedo_color = body_color
		_paint.roughness = paint_roughness
		_paint.metallic = paint_metalness
	if _wheel_material:
		_wheel_material.albedo_color = wheel_color

func _apply_stance() -> void:
	var offsets: Array[float] = [0.0, -0.04, -0.075]
	var insets: Array[float] = [0.0, 0.02, 0.035]
	$Visual/BodyShell.position.y = offsets[stance]
	for name in ["FrontLeftPivot", "FrontRightPivot", "RearLeftPivot", "RearRightPivot"]:
		var pivot: Node3D = get_node("Visual/" + name)
		pivot.position.x = signf(pivot.position.x) * (0.92 - insets[stance])

func animate_car(steer: float, forward_speed: float, delta: float) -> void:
	_spin -= forward_speed * delta / 0.36
	for name in ["FrontLeftPivot", "FrontRightPivot", "RearLeftPivot", "RearRightPivot"]:
		var pivot: Node3D = get_node("Visual/" + name)
		pivot.rotation.y = -steer * 0.42 if name.begins_with("Front") else 0.0
		pivot.get_node("Spin").rotation.x = _spin
	$Visual.rotation.z = -steer * clampf(absf(forward_speed) / 53.0, 0.0, 1.0) * 0.045
