extends Node3D
## A display-only shape study. Neither mesh instance participates in driving.

@export var environment: Environment
@export var clay_material: StandardMaterial3D
@onready var our_car: Node3D = $OurTurntable/Car
@onready var reference_car: Node3D = $ReferenceTurntable/ReferenceCar
var clay_enabled: bool = true
var _authored_materials: Dictionary = {}

func _ready() -> void:
	for model in [our_car, reference_car]:
		for mesh in model.find_children("*", "MeshInstance3D", true, false):
			_authored_materials[mesh] = mesh.material_override
		# Our presentation copy has head/tail lights; disable them so both
		# subjects receive identical external lighting in either material mode.
		for light in model.find_children("*", "Light3D", true, false):
			light.visible = false
	set_clay(true)
	set_angle(0.0)

func set_clay(enabled: bool) -> void:
	clay_enabled = enabled
	for mesh: MeshInstance3D in _authored_materials:
		mesh.material_override = clay_material if enabled else _authored_materials[mesh]

func set_angle(angle: float) -> void:
	# Rotate around each car's own center, preserving side-by-side framing.
	$OurTurntable.rotation.y = -0.55 + angle
	$ReferenceTurntable.rotation.y = -0.55 + angle
