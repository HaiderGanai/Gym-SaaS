// members/entities/waiver.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { Member } from './member.entity';
import { Gym } from 'src/gym/entities/gym.entity';

@Unique(['member_id', 'gym_id'])
@Entity('waivers')
export class Waiver {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  member_id!: string;

  @ManyToOne(() => Member, (m) => m.waivers)
  @JoinColumn({ name: 'member_id' })
  member!: Member;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.waivers)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ nullable: true })
  document_url!: string;

  @Column({ nullable: true })
  signature_url!: string;

  @Column({ nullable: true })
  ip_address!: string;

  @Column()
  signed_at!: Date;
}