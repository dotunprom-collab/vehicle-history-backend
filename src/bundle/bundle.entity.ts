import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class Bundle {

  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  email!: string;

  @Column()
  remaining!: number;

  @Column({
    default: true,
  })
  active!: boolean;

  // =========================
  // TIER TYPE
  // =========================

  @Column({
    default: 'standard',
  })
  tier!: string;

  @CreateDateColumn()
  createdAt!: Date;
}