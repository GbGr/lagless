import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PlayerSchema } from './player.schema';

@Entity('login_logs')
export class LoginLogSchema {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  public id!: string;

  @ManyToOne(() => PlayerSchema, { onDelete: 'CASCADE' })
  public player!: PlayerSchema;

  @Column()
  public playerId!: PlayerSchema['id'];

  @Column({ type: 'inet' })
  public ipAddress!: string;

  @CreateDateColumn()
  public loginAt!: Date;
}
