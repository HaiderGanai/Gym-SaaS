# HelpModule — Postman Endpoints

Base URL (dev): `http://localhost:3000/api/v1`

All five endpoints are `GET`, **public** — no `Authorization` header, no
role, no gym scoping. Content is currently hardcoded placeholder copy in
`src/help/help.service.ts` (no DB table); the same routes and response
shapes will keep working once real FAQ/legal/support copy replaces the constants.

---

## 1. FAQs

**GET** `/help/faqs`

**200:**
```json
[
  {
    "id": 1,
    "question": "How do I book a class?",
    "answer": "Go to Schedule, pick a class, and tap Book. You'll get a QR code for check-in."
  },
  {
    "id": 2,
    "question": "How do I pause or cancel my membership?",
    "answer": "Go to My Membership and choose Pause or Cancel. Paused time is added back when you resume."
  },
  {
    "id": 3,
    "question": "What happens if I miss a class I booked?",
    "answer": "You'll be marked as a no-show if you don't check in. Cancel ahead of the cutoff time to free your spot instead."
  },
  {
    "id": 4,
    "question": "How do I update my payment method?",
    "answer": "Visit the gym front desk to update how you pay for your membership."
  },
  {
    "id": 5,
    "question": "How do I reset my password?",
    "answer": "On the login screen, tap Forgot Password and follow the emailed code."
  }
]
```

---

## 2. Privacy Policy

**GET** `/help/privacy-policy`

**200:**
```json
{
  "title": "Privacy Policy",
  "updated_at": "2026-01-01",
  "content": "This is placeholder privacy policy text. It explains what member data we collect, how it is used, and how members can request access or deletion. Replace with the final legal copy before launch."
}
```

---

## 3. Terms of Service

**GET** `/help/terms`

**200:**
```json
{
  "title": "Terms of Service",
  "updated_at": "2026-01-01",
  "content": "This is placeholder terms of service text covering membership terms, booking rules, and liability. Replace with the final legal copy before launch."
}
```

---

## 4. Membership Terms

**GET** `/help/membership-terms`

**200:**
```json
{
  "title": "Membership Terms",
  "updated_at": "2026-01-01",
  "content": "This is placeholder membership terms text covering billing cycles, pause/resume rules, cancellation policy, and refund eligibility. Replace with the final legal copy before launch."
}
```

Distinct from `/help/terms` (general ToS — booking rules, liability): this is billing/subscription-specific — the stuff a member actually looks up before pausing or cancelling.

---

## 5. Contact Support

**GET** `/help/contact-support`

**200:**
```json
{
  "email": "support@example.com",
  "phone": "+1 (555) 010-2020",
  "hours": "Mon–Fri, 9:00 AM – 6:00 PM",
  "address": "123 Placeholder Ave, Suite 100, Sample City, ST 00000"
}
```

---

## Notes

- No request body, no query params, no auth on any of the five endpoints.
- Content is intentionally hardcoded (`ponytail:` marked in `help.service.ts`)
  — swap the `FAQS` / `PRIVACY_POLICY` / `TERMS` / `MEMBERSHIP_TERMS` /
  `CONTACT_SUPPORT` constants for real copy whenever legal/product/support
  delivers it. No route or response-shape change needed on the frontend
  when that happens.
- If this ever needs to become staff-editable (e.g. org_admin updates FAQs
  from a dashboard), that's a follow-up: a single-row entity + `PATCH`
  endpoint, not built now since it wasn't asked for.
