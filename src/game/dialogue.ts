import type { ViolationCode } from '../core/model/violations';
import type { Random } from '../core/random';
import type { Mood, ScenarioKind } from './types';

const firstName = (name: string) => name.replace(/^(Prof|Dr)\.\s*/, '').split(' ')[0] ?? name;

const GREETINGS: Record<ScenarioKind | 'borrow', readonly string[]> = {
  borrow: [
    "Hi, I'm {name}. I'd like to borrow this one, please.",
    "Hello! {name} here. Can I take this home?",
    "Morning. I'm {name}, I'd like to check this out.",
    "Hi there, {name}. Just this one today.",
  ],
  'valid-borrow': [],
  'hold-pickup': ["Hi, I'm {name}. I got a call that my reservation is in?", "{name}. You're holding a book for me, I think."],
  'card-expiring': [],
  'near-fine-limit': [],
  'near-loan-limit': [],
  'expired-card': [],
  'someone-elses-card': [],
  'forged-card': [],
  'lost-card': ["I'm {name}. I found my old card in my coat, so it's fine, right? I'd like this one."],
  suspended: [],
  'loan-limit': ["Hi, {name}. Just one more for my exams, please."],
  overdue: [],
  fines: [],
  reference: ["Hi, I'm {name}. I need this for an essay, can I take it home tonight?"],
  'held-for-another': ["Hi, {name}. This was on the shelf behind you. Can I have it?", "{name}. I spotted this behind the counter, I'll take it."],
  'return-good': ['Just returning this, thanks.', 'Here you go, all finished.', 'Bringing this one back.'],
  'return-damaged': ['Just returning this.', 'Here, all done with it.', "Bringing this back. It's fine, I think."],
  'valid-renew': ["Hi, {name}. Could I keep this a bit longer?", "{name} here. I'd like to renew this, please."],
  'last-renewal': ["Hi, {name}. Could I keep this a bit longer?", "{name}. One more renewal, please?"],
  'renew-limit': ["{name}. Can I renew this again? I'm nearly done.", "Hi, {name}. One more renewal, please?"],
  'renew-overdue': ["Hi, {name}. Can I renew this? It might be a little late…"],
  'renew-waiting': ["{name} here. Can I keep this another couple of weeks?"],
};

export function greetingFor(kind: ScenarioKind, name: string, random: Random): string {
  const lines = GREETINGS[kind].length > 0 ? GREETINGS[kind] : GREETINGS.borrow;
  return random.pick(lines).replace('{name}', firstName(name));
}

/** What the patron says back when refused for a reason that was right. */
const CAUGHT: Partial<Record<ViolationCode, readonly string[]>> = {
  CARD_EXPIRED: ['Expired? Since when? Ugh, fine.', "Oh. I'll renew it at the office."],
  CARD_MISMATCH: ["It's my sister's… she said it was fine.", 'Worth a try.'],
  CARD_UNKNOWN: ['What do you mean, no record? …Fine.', 'The man who sold it to me said it would work.'],
  CARD_INACTIVE: ['But I found it again!', "Right, I reported it lost. I'll use the new one."],
  MEMBER_SUSPENDED: ['Suspended?! I want to speak to the director.', 'Oh. That letter was real, then.'],
  LOAN_LIMIT_REACHED: ['But exams!', "Fine, I'll bring one back first."],
  HAS_OVERDUE_LOANS: ["Oh, I forgot I still had that one.", "I'll bring it back tomorrow, promise."],
  FINES_OUTSTANDING: ['How much do I owe?! …Fine.', "I'll pay next week."],
  REFERENCE_ONLY: ["I'll read it here then.", 'Not even for one night?'],
  COPY_ON_HOLD_FOR_ANOTHER: ["Oh, it's reserved? Sorry.", 'Can I get in line for it, then?'],
  RENEWAL_LIMIT_REACHED: ["I'll finish it tonight then.", 'Already renewed twice? Time flies.'],
  LOAN_OVERDUE: ["Right, it's late. I'll return it.", 'Ah. How much is the fine?'],
  BOOK_HAS_WAITING_RESERVATIONS: ['Someone else wants it? Fair enough.', "OK, I'll bring it back."],
};

const THANKS = ['Thank you!', 'Great, thanks.', 'Cheers!', 'Thanks, see you next week.'];
const WRONGED = [
  "What? There's nothing wrong with my account!",
  "I've been a member for years. This is ridiculous.",
  "Check again. I'm sure I'm allowed.",
  "I'm filing a complaint.",
];
const DAMAGE_DENIAL = ["Damaged? It was like that when I got it!", "Hey, that's not fair."];
const RETURN_THANKS = ['Thanks!', 'Bye now.', 'See you.'];

export function replyFor(
  random: Random,
  outcome: 'served' | 'caught' | 'wronged' | 'returned' | 'charged-damage' | 'late-fine',
  reason?: ViolationCode,
): { reply: string; mood: Mood } {
  switch (outcome) {
    case 'served':
      return { reply: random.pick(THANKS), mood: 'happy' };
    case 'caught':
      return { reply: random.pick(CAUGHT[reason!] ?? ['Oh. OK.']), mood: 'annoyed' };
    case 'wronged':
      return { reply: random.pick(WRONGED), mood: 'angry' };
    case 'returned':
      return { reply: random.pick(RETURN_THANKS), mood: 'neutral' };
    case 'charged-damage':
      return { reply: random.pick(DAMAGE_DENIAL), mood: 'annoyed' };
    case 'late-fine':
      return { reply: 'A late fine? Fine, fine.', mood: 'annoyed' };
  }
}
