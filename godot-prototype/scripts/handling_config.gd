class_name WorkshopHandling
extends Resource
## Inspector tuning surface. Defaults follow the browser HANDLING values.

@export_group("Engine")
@export_range(10.0, 90.0, 1.0) var top_speed: float = 53.0
@export_range(1.0, 30.0, 0.5) var reverse_speed: float = 11.0
@export_range(1.0, 40.0, 0.5) var engine_acceleration: float = 18.0
@export var high_speed_acceleration: float = 5.5
@export var reverse_acceleration: float = 8.0
@export_range(1.0, 50.0, 0.5) var brake_deceleration: float = 29.0
@export var rolling_resistance: float = 1.3
@export var aerodynamic_drag: float = 0.0028

@export_group("Steering and grip")
@export_range(1.0, 12.0, 0.1) var steering_response: float = 5.5
@export var max_steer_curvature: float = 1.0 / 8.5
@export_range(5.0, 35.0, 0.5) var max_lateral_acceleration: float = 18.0
@export var max_body_yaw_rate: float = 2.1
@export var yaw_response: float = 7.5
@export var coast_yaw_response: float = 4.2
@export_range(1.0, 16.0, 0.1) var lateral_grip: float = 8.8
@export_range(0.5, 8.0, 0.05) var drift_grip: float = 2.25

@export_group("Handbrake")
@export var handbrake_yaw_bonus: float = 0.95
@export var handbrake_yaw_response: float = 10.5
@export var handbrake_drag: float = 2.4
