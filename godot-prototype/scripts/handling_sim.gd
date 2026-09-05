class_name WorkshopSim
extends RefCounted
## Fixed-step planar handling, independent of scene nodes and input devices.
## Contact resolution belongs to player.gd; free driving can be tested headless.

const DT: float = 1.0 / 60.0
var tick: int = 0
var position: Vector2 = Vector2.ZERO # x/z
var velocity: Vector2 = Vector2.ZERO
var heading: float = 0.0
var steering: float = 0.0
var yaw_rate: float = 0.0
var input_log: Array[Vector4] = []

func reset(at: Vector2 = Vector2.ZERO, facing: float = 0.0) -> void:
	tick = 0
	position = at
	velocity = Vector2.ZERO
	heading = facing
	steering = 0.0
	yaw_rate = 0.0
	input_log.clear()

func forward() -> Vector2:
	return Vector2(-sin(heading), -cos(heading))

func right() -> Vector2:
	return Vector2(cos(heading), -sin(heading))

func step(input: Vector4, config: WorkshopHandling) -> void:
	var throttle: float = clampf(input.x, 0.0, 1.0)
	var brake: float = clampf(input.y, 0.0, 1.0)
	var steer: float = clampf(input.z, -1.0, 1.0)
	var handbrake: float = clampf(input.w, 0.0, 1.0)
	input_log.append(Vector4(throttle, brake, steer, handbrake))
	if handbrake > 0.05:
		throttle = 0.0
	var f: Vector2 = forward()
	var r: Vector2 = right()
	var forward_speed: float = velocity.dot(f)
	var lateral_speed: float = velocity.dot(r)
	if throttle > 0.0:
		var ratio: float = clampf(maxf(0.0, forward_speed) / config.top_speed, 0.0, 1.0)
		forward_speed += lerpf(config.engine_acceleration, config.high_speed_acceleration, ratio) * throttle * DT
	if brake > 0.0:
		if forward_speed > 0.7:
			forward_speed = maxf(0.0, forward_speed - config.brake_deceleration * brake * DT)
		else:
			forward_speed -= config.reverse_acceleration * brake * DT
	if throttle == 0.0 and brake == 0.0 and handbrake == 0.0:
		forward_speed = move_toward(forward_speed, 0.0, config.rolling_resistance * DT)
	forward_speed -= signf(forward_speed) * config.aerodynamic_drag * forward_speed * forward_speed * DT
	forward_speed = move_toward(forward_speed, 0.0, config.handbrake_drag * handbrake * DT)
	forward_speed = clampf(forward_speed, -config.reverse_speed, config.top_speed)
	steering = move_toward(steering, steer, config.steering_response * DT)
	var speed: float = absf(forward_speed)
	var normal_yaw: float = 0.0
	if speed >= 0.01 and absf(steering) >= 0.001:
		normal_yaw = minf(speed * config.max_steer_curvature * absf(steering),
			minf(config.max_lateral_acceleration / maxf(speed, 1.0), config.max_body_yaw_rate))
	var extra_yaw: float = absf(steering) * clampf(speed / 4.5, 0.0, 1.0) * handbrake * config.handbrake_yaw_bonus
	var reverse_direction: float = -1.0 if forward_speed < -0.25 else 1.0
	var target_yaw: float = clampf(-signf(steering) * (normal_yaw + extra_yaw) * reverse_direction,
		-config.max_body_yaw_rate, config.max_body_yaw_rate)
	var response: float = config.coast_yaw_response
	if handbrake > 0.05:
		response = config.handbrake_yaw_response
	elif throttle > 0.0 or brake > 0.0:
		response = config.yaw_response
	yaw_rate = move_toward(yaw_rate, target_yaw, response * DT)
	var drift: float = clampf(handbrake + absf(steering) * throttle * clampf((speed - 12.0) / 18.0, 0.0, 1.0), 0.0, 1.0)
	var grip: float = lerpf(config.lateral_grip, config.drift_grip, drift)
	lateral_speed = clampf(lateral_speed * maxf(0.0, 1.0 - grip * DT), -config.top_speed * 0.55, config.top_speed * 0.55)
	velocity = f * forward_speed + r * lateral_speed
	position += velocity * DT
	heading = wrapf(heading + yaw_rate * DT, -PI, PI)
	tick += 1
