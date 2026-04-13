import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class Bundle {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  userId!: string; // email

  @Column()
  total!: number;

  @Column()
  remaining!: number;

  @Column()
  type!: string;

  @Column({ nullable: true })
  stripeSessionId!: string;

  @Column({ default: true })
  active!: boolean;

  @Column({ nullable: true })
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}