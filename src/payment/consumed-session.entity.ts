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

  @Column({ nullable: true })
  email!: string | null; // ✅ FIXED

  @CreateDateColumn()
  createdAt!: Date;
}