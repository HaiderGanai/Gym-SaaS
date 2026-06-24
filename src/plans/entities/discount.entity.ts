// plans/entities/discount.entity.ts
import { Gym } from 'src/gym/entities/gym.entity';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED      = 'fixed',
}

@Entity('discounts')
export class Discount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.discounts)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column()
  code!: string;

  @Column({ type: 'enum', enum: DiscountType })
  type!: DiscountType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value!: number;

  @Column({ nullable: true })
  max_uses!: number;

  @Column({ default: 0 })
  used_count!: number;

  @Column({ type: 'date', nullable: true })
  expires_at!: Date;

  @CreateDateColumn()
  created_at!: Date;
}