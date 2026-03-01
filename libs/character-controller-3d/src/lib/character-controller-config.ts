export interface CharacterControllerConfig {
  /** Walking speed (units/sec). Default: 4 */
  walkSpeed: number;
  /** Running speed (units/sec). Default: 8 */
  runSpeed: number;
  /** Acceleration toward target speed (units/sec²). Default: 40 */
  acceleration: number;
  /** Deceleration when no input (units/sec²). Default: 60 */
  deceleration: number;
  /** Gravity acceleration (units/sec²). Default: 20 */
  gravity: number;
  /** Jump force (initial vertical velocity, units/sec). Default: 8 */
  jumpForce: number;
  /** Max number of jumps (1 = no double jump). Default: 1 */
  maxJumps: number;
  /** Max fall speed (units/sec). Default: 30 */
  maxFallSpeed: number;
  /** Capsule collider half-height. Default: 0.5 */
  capsuleHalfHeight: number;
  /** Capsule collider radius. Default: 0.3 */
  capsuleRadius: number;
  /** KCC skin offset. Default: 0.01 */
  kccOffset: number;
  /** Max slope climb angle in radians. Default: PI/4 (45 degrees) */
  maxSlopeClimbAngle: number;
  /** Min slope slide angle in radians. Default: PI/6 (30 degrees) */
  minSlopeSlideAngle: number;
  /** Autostep max height. 0 to disable. Default: 0.3 */
  autostepMaxHeight: number;
  /** Autostep min width. Default: 0.2 */
  autostepMinWidth: number;
  /** Snap to ground distance. 0 to disable. Default: 0.3 */
  snapToGroundDistance: number;
}

export const DEFAULT_CHARACTER_CONTROLLER_CONFIG: CharacterControllerConfig = {
  walkSpeed: 4,
  runSpeed: 8,
  acceleration: 40,
  deceleration: 60,
  gravity: 20,
  jumpForce: 8,
  maxJumps: 1,
  maxFallSpeed: 30,
  capsuleHalfHeight: 0.5,
  capsuleRadius: 0.3,
  kccOffset: 0.01,
  maxSlopeClimbAngle: Math.PI / 4,
  minSlopeSlideAngle: Math.PI / 6,
  autostepMaxHeight: 0.3,
  autostepMinWidth: 0.2,
  snapToGroundDistance: 0.3,
};
