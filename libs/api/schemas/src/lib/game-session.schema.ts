import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PlayerSchema } from './player.schema';
import { GameSchema } from './game.schema';

@Entity('game_sessions')
export class GameSessionSchema {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  public id!: string;

  @ManyToOne(() => GameSchema, { onDelete: 'CASCADE' })
  public game!: GameSchema;

  @Column()
  public gameId!: GameSchema['id'];

  @ManyToOne(() => PlayerSchema, { onDelete: 'CASCADE' })
  public player!: PlayerSchema;

  @Column()
  public playerId!: PlayerSchema['id'];

  @Column()
  public gameLeavedAt?: Date;
}
