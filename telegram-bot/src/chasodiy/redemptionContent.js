export const REDEMPTION_DURATION_DAYS = 30;

const REDEMPTION_QUOTES = [
  "Redemption begins the moment you stop negotiating with your old excuses.",
  "Your future is built by what you repeat when nobody applauds.",
  "Growth is often quiet: less drama, more discipline.",
  "You do not need a new life overnight. You need a new choice today.",
  "Healing is not linear, but commitment can still be.",
  "Every honest step forward is a vote for the person you are becoming.",
  "Consistency is self-respect in motion.",
  "You cannot rewrite yesterday, but you can outgrow it.",
  "Small promises kept to yourself become character.",
  "Redemption is not perfection. It is daily return.",
  "Your habits write your biography before your words do.",
  "A calm mind and a clear action beat motivation every time.",
  "The bravest thing you can do is start again without self-hate.",
  "Discomfort is often the doorway to your next level.",
  "You are not behind. You are in training.",
  "What you practice in private appears in public.",
  "Let discipline carry you when feelings fade.",
  "Every day is a chance to choose alignment over impulse.",
  "Maturity is choosing long-term peace over short-term relief.",
  "You become trustworthy by keeping promises to yourself first.",
  "Redemption is a direction, not a single event.",
  "Your limits are often old stories, not current facts.",
  "Progress is built by boring, repeatable wins.",
  "The version of you that you admire is built one decision at a time.",
  "You are allowed to evolve beyond who you were in pain.",
  "When you fall, return faster. That is growth.",
  "Clarity comes from action, not endless thinking.",
  "Your standards shape your destiny.",
  "Courage is consistency under pressure.",
  "The life you want is hidden inside the work you avoid.",
  "Redemption is choosing purpose when comfort calls louder.",
  "You are strongest when your actions match your values.",
  "A better identity is earned through repeated proof.",
  "Energy follows meaning. Remember why you started.",
  "Your next chapter begins with one honest decision now.",
];

const REDEMPTION_MICRO_ACTIONS = [
  "Drink a glass of water and breathe deeply for one minute.",
  "Write down one behavior you want to leave behind.",
  "Spend 10 minutes in focused silence without scrolling.",
  "Do one hard task first, before comfort.",
  "Send one sincere message of gratitude.",
  "Take a 15-minute walk and reflect on your direction.",
  "Clean one small area around you to reset your mind.",
  "Journal one page about the person you are becoming.",
  "Read 2 pages of a book that strengthens you.",
  "Replace one complaint with one concrete action.",
];

export function pickRedemptionMessage(dayNumber) {
  const dayIdx = Math.max(0, dayNumber - 1);
  const quote = REDEMPTION_QUOTES[dayIdx % REDEMPTION_QUOTES.length];
  const action = REDEMPTION_MICRO_ACTIONS[dayIdx % REDEMPTION_MICRO_ACTIONS.length];
  return { quote, action };
}
