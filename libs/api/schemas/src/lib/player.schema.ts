import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('players')
export class PlayerSchema {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ unique: true, length: 32 })
  public username!: string;

  @Column({ type: 'integer', default: 1000 })
  public mmr!: number;

  @Column({ type: 'integer', default: 0 })
  public score!: number;

  @CreateDateColumn()
  public createdAt!: Date;
}
