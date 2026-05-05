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

  @Column({ type: 'text', nullable: true }) // ✅ FIX
  email!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}