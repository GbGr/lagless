import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PlayerSchema } from './player.schema';
import { GameSchema } from './game.schema';

@Index(['gameId', 'playerId'], { unique: true })
@Index(['gameId', 'slot'], { unique: true })
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

  @Column({ type: 'smallint' })
  public slot!: number;

  @Column()
  public hash!: number;

  @Column({ nullable: true })
  public score?: number;

  @CreateDateColumn()
  public joinedAt!: Date;

  @Column({ nullable: true })
  public mmrChange?: number;

  @Column({ nullable: true })
  public gameLeavedAt?: Date;

  @Column({ nullable: true })
  public gameFinishedAt?: Date;

}
