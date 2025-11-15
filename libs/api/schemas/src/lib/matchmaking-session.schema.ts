import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PlayerSchema } from './player.schema';
import { GameSchema } from './game.schema';

@Entity()
export class MatchmakingSessionSchema {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  public id!: string;

  @ManyToOne(() => PlayerSchema, { onDelete: 'CASCADE' })
  public player!: PlayerSchema;

  @Column()
  public playerId!: PlayerSchema['id'];

  @ManyToOne(() => GameSchema, { onDelete: 'CASCADE', nullable: true })
  public game?: GameSchema;

  @Column({ nullable: true })
  public gameId?: GameSchema['id'];

  @Column({ nullable: true })
  public startedAt?: Date;

  @Column({ nullable: true })
  public cancelledAt?: Date;

  @Column({ nullable: true })
  public matchedAt?: Date;
}
