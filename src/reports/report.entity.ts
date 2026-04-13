import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class Report {

  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  reg!: string;

  @Column({ nullable: true })
  make!: string;

  @Column({ nullable: true })
  model!: string;

  @Column({ nullable: true })
  riskScore!: number;

  @Column({ type: 'simple-json', nullable: true })
  data!: any;

  // 🔥 NEW: PAYMENT STATUS
  @Column({ default: 'pending' })
  status!: string; // 'pending' | 'paid'

  // 🔥 NEW: PACKAGE TYPE
  @Column({ nullable: true })
  pkg!: string; // basic | standard | premium

  // 🔥 NEW: BUNDLE SUPPORT
  @Column({ nullable: true })
  bundle!: string; // "3" | "5"

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ nullable: true })
  userId!: string;
}