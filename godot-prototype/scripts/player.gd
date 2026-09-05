extends CharacterBody3D
## Godot contact adapter for the fixed-step driving model.

@export var handling: WorkshopHandling
var sim: WorkshopSim = WorkshopSim.new()
var driving: bool = false
var command: Vector4 = Vector4.ZERO

func _ready() -> void:
	if not handling:
		handling = WorkshopHandling.new()
	reset_to(global_position, rotation.y)

func reset_to(at: Vector3, facing: float) -> void:
	global_position = at
	rotation.y = facing
	sim.reset(Vector2(at.x, at.z), facing)
	velocity = Vector3.ZERO
	command = Vector4.ZERO

func _physics_process(_delta: float) -> void:
	if not driving:
		return
	sim.step(command, handling)
	rotation.y = sim.heading
	velocity = Vector3(sim.velocity.x, 0.0, sim.velocity.y)
	var contact: KinematicCollision3D = move_and_collide(velocity * WorkshopSim.DT)
	if contact:
		var normal: Vector3 = contact.get_normal()
		velocity = velocity.slide(normal) * 0.72
		move_and_collide(contact.get_remainder().slide(normal))
		sim.velocity = Vector2(velocity.x, velocity.z)
	sim.position = Vector2(global_position.x, global_position.z)
	$Car.animate_car(sim.steering, sim.velocity.dot(sim.forward()), WorkshopSim.DT)

func set_garage_pose(at: Vector3) -> void:
	driving = false
	reset_to(at, 0.0)
	$Car.animate_car(0.0, 0.0, 0.0)
