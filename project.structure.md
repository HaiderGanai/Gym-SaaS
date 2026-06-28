src/
├── app.module.ts
├── main.ts
│
├── organization/
│   ├── organization.module.ts
│   ├── organization.controller.ts
│   ├── organization.service.ts
│   └── entities/
│       └── organization.entity.ts
│
├── gym/
│   ├── gym.module.ts
│   ├── gym.controller.ts
│   ├── gym.service.ts
│   └── entities/
│       └── gym.entity.ts
│
├── staff/
│   ├── staff.module.ts
│   ├── staff.controller.ts
│   ├── staff.service.ts
│   └── entities/
│       ├── staff-user.entity.ts
│       └── staff-gym-access.entity.ts
│
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/
│   │   ├── staff-jwt.strategy.ts
│   │   └── member-jwt.strategy.ts
│   └── guards/
│       ├── staff-jwt.guard.ts
│       ├── member-jwt.guard.ts
│       └── roles.guard.ts
│
├── members/
│   ├── members.module.ts
│   ├── members.controller.ts
│   ├── members.service.ts
│   └── entities/
│       ├── member.entity.ts
│       ├── member-gym-access.entity.ts
│       └── waiver.entity.ts
│
├── plans/
│   ├── plans.module.ts
│   ├── plans.controller.ts
│   ├── plans.service.ts
│   └── entities/
│       ├── membership-plan.entity.ts
│       └── discount.entity.ts
│
├── subscriptions/
│   ├── subscriptions.module.ts
│   ├── subscriptions.controller.ts
│   ├── subscriptions.service.ts
│   └── entities/
│       └── member-subscription.entity.ts
│
├── invoices/
│   ├── invoices.module.ts
│   ├── invoices.controller.ts
│   ├── invoices.service.ts
│   └── entities/
│       └── invoice.entity.ts
│
├── vat/
│   ├── vat.module.ts
│   ├── vat.service.ts
│   └── entities/
│       └── vat-period-summary.entity.ts
│
├── schedule/
│   ├── schedule.module.ts
│   ├── schedule.controller.ts
│   ├── schedule.service.ts
│   └── entities/
│       ├── slot-template.entity.ts
│       └── slot.entity.ts
│
├── bookings/
│   ├── bookings.module.ts
│   ├── bookings.controller.ts
│   ├── bookings.service.ts
│   └── entities/
│       └── booking.entity.ts
│
├── communication/
│   ├── communication.module.ts
│   ├── communication.service.ts  (EmailService + PushService combined)
│   └── entities/
│       └── notification-log.entity.ts
│
└── reports/
    ├── reports.module.ts
    ├── reports.controller.ts
    ├── reports.service.ts
    └── entities/
        ├── ai-report.entity.ts
        └── org-report.entity.ts