/**
 * Interface for a CharacterState component from codegen.
 * The game's codegen produces a class with these fields.
 * Each field has `get(entity): number` / `set(entity, value): void`.
 */
export interface ICharacterStateComponent {
  verticalVelocity: { get(entity: number): number; set(entity: number, value: number): void };
  grounded: { get(entity: number): number; set(entity: number, value: number): void };
  currentSpeed: { get(entity: number): number; set(entity: number, value: number): void };
  jumpCount: { get(entity: number): number; set(entity: number, value: number): void };
  moveInputX: { get(entity: number): number; set(entity: number, value: number): void };
  moveInputZ: { get(entity: number): number; set(entity: number, value: number): void };
  isSprinting: { get(entity: number): number; set(entity: number, value: number): void };
  facingYaw: { get(entity: number): number; set(entity: number, value: number): void };
  locomotionAngle: { get(entity: number): number; set(entity: number, value: number): void };
}
