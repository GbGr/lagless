import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PlayerSchema } from '@lagless/schemas';

@Index([ 'playerId', 'skinId'], { unique: true })
@Entity()
export class SumoPlayerSkinsSchema {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  public id!: string;

  @ManyToOne(() => PlayerSchema)
  public player!: PlayerSchema;

  @Column()
  public playerId!: PlayerSchema['id'];

  @Column({ type: 'smallint' })
  public skinId!: number;
}
