/** Android notification channel for reminder notifications. */
export const REMINDER_CHANNEL_ID = 'reminders';

/** Stable trigger ids — cancelled and rescheduled on every sync. */
export const MORNING_REMINDER_ID = 'paisaflow-morning';
export const EVENING_REMINDER_ID = 'paisaflow-evening';

export const MORNING_REMINDER_COPY = {
  title: "Plan today's spending",
  body: 'Review yesterday and set an intention for today.',
} as const;

export const EVENING_REMINDER_COPY = {
  title: "Review today's expenses",
  body: "Add anything you missed and check today's summary.",
} as const;
