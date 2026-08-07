import { Injectable } from '@nestjs/common';

// ponytail: dummy content until product/legal supplies real copy — swap these
// constants for real text, no route/shape changes needed.
const FAQS = [
  {
    id: 1,
    question: 'How do I book a class?',
    answer: 'Go to Schedule, pick a class, and tap Book. You\'ll get a QR code for check-in.',
  },
  {
    id: 2,
    question: 'How do I pause or cancel my membership?',
    answer: 'Go to My Membership and choose Pause or Cancel. Paused time is added back when you resume.',
  },
  {
    id: 3,
    question: 'What happens if I miss a class I booked?',
    answer: 'You\'ll be marked as a no-show if you don\'t check in. Cancel ahead of the cutoff time to free your spot instead.',
  },
  {
    id: 4,
    question: 'How do I update my payment method?',
    answer: 'Visit the gym front desk to update how you pay for your membership.',
  },
  {
    id: 5,
    question: 'How do I reset my password?',
    answer: 'On the login screen, tap Forgot Password and follow the emailed code.',
  },
];

const PRIVACY_POLICY = {
  title: 'Privacy Policy',
  updated_at: '2026-01-01',
  content:
    'This is placeholder privacy policy text. It explains what member data we collect, how it is used, and how members can request access or deletion. Replace with the final legal copy before launch.',
};

const TERMS = {
  title: 'Terms of Service',
  updated_at: '2026-01-01',
  content:
    'This is placeholder terms of service text covering membership terms, booking rules, and liability. Replace with the final legal copy before launch.',
};

@Injectable()
export class HelpService {
  getFaqs() {
    return FAQS;
  }

  getPrivacyPolicy() {
    return PRIVACY_POLICY;
  }

  getTerms() {
    return TERMS;
  }
}
