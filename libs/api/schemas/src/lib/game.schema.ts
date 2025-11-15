import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('games')
export class GameSchema {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ type: 'smallint' })
  public playersCount!: number;

  @Column({ nullable: true })
  public finishedAt?: Date;

  @Column({ nullable: true })
  public destroyedAt?: Date;

  @CreateDateColumn()
  public createdAt!: Date;
}
