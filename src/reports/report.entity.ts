import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class Report {

  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  reg!: string;

  @Column()
  make!: string;

  @Column()
  model!: string;

  @Column()
  riskScore!: number;

  @Column({ type: 'simple-json', nullable: true })
  data!: any;

  @CreateDateColumn()
  createdAt!: Date;
}