import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class ConsumedSession {
  @PrimaryGeneratedColumn()
  id!: number;
  @Column({ unique: true })
  sessionId!: string;
  @Column()
  reg!: string;
  @CreateDateColumn()
  createdAt!: Date;
}