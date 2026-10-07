import { z } from 'zod';

const handleRe = /^[a-z0-9_.]{3,20}$/;

export const SignupSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(40),
  handle: z.string().trim().toLowerCase().regex(handleRe, 'Use 3–20 chars: a–z, 0–9, . _').optional().or(z.literal('')),
  secret: z.string().min(6, 'At least 6 characters').max(200),
  contact: z.string().trim().max(120).optional().or(z.literal('')),
  currency: z.enum(['INR', 'USD', 'GBP', 'EUR', 'AED', 'SGD', 'AUD', 'CAD']).default('INR'),
  inviteCode: z.string().trim().max(24).optional().or(z.literal('')),
  demo: z.literal(true).optional(),
});

export const LoginSchema = z.object({
  id: z.string().trim().min(2).max(120),
  secret: z.string().min(1).max(200),
});

export const FriendSchema = z.object({
  name: z.string().trim().min(1, 'Give them a name').max(40),
  handle: z.string().trim().toLowerCase().regex(handleRe).optional().or(z.literal('')),
  note: z.string().trim().max(120).optional().or(z.literal('')),
});

export const MomentSchema = z.object({
  title: z.string().trim().min(1, 'Give this moment a few words').max(80),
  note: z.string().trim().max(500).optional().or(z.literal('')),
  occurredOn: z.iso.date().refine((date) => date <= new Date(Date.now() + 86400000).toISOString().slice(0, 10), 'Choose a day that has happened'),
  photo: z.string().max(4_000_000).optional(),
  photos: z.array(z.string().max(4_000_000)).max(4, 'Add up to four photos').optional(),
});

export const EntrySchema = z.object({
  mutationId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/).optional(),
  photo: z.string().max(4_000_000).optional(),
  photos: z.array(z.string().max(4_000_000)).max(4, 'Add up to four photos').optional(),
  friendshipId: z.string().min(3, 'Pick a person first'),
  kind: z.enum(['money', 'favor', 'gesture']),
  direction: z.enum(['owed_to_me', 'owed_by_me']),
  amount: z.coerce.number().int().min(0).max(10_000_000).default(0),
  note: z.string().trim().max(140).optional().or(z.literal('')),
  dueAt: z.coerce.number().int().positive().optional().nullable(),
});

export const SplitSchema = z.object({
  groupId: z.string().min(3, 'Invalid group'),
  title: z.string().trim().min(1, 'Give this bill a name').max(80),
  amount: z.coerce.number().int().min(1, 'Enter an amount above zero').max(10_000_000),
  payer: z.object({ kind: z.enum(['me', 'friend']), friendshipId: z.string().optional() }),
  shares: z
    .array(z.object({ friendshipId: z.string().min(1, 'Invalid participant'), amount: z.coerce.number().int().min(0) }))
    .min(1)
    .max(30),
  method: z.enum(['equal', 'custom']).default('equal'),
  note: z.string().trim().max(140).optional().or(z.literal('')),
});

export const GroupSchema = z.object({
  name: z.string().trim().min(1).max(40),
  members: z.array(z.string().min(3, 'Invalid member')).min(1, 'Pick at least one person').max(30),
});

export const ProfileSchema = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  currency: z.enum(['INR', 'USD', 'GBP', 'EUR', 'AED', 'SGD', 'AUD', 'CAD']).optional(),
  theme: z.enum(['light', 'dark', 'sage']).optional(),
  voiceMode: z.enum(['neutral', 'male', 'female']).optional(),

});

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const raw = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
    const parsed = schema.safeParse(raw ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      // Zod's default "Too small" / "Too big" messages are ugly for users.
      // Replace them with something friendlier.
      let msg = issue?.message || 'That input doesn\'t look right.';
      if (msg.startsWith('Too small') || msg.startsWith('Too big') || msg.startsWith('String must') || msg.startsWith('Number must') || msg.startsWith('Array must')) {
        const field = issue?.path?.join('.') || 'input';
        msg = `Please check the ${field} field — it doesn't look right.`;
      }
      return res.status(400).json({
        error: 'validation_failed',
        message: msg,
        field: issue?.path?.join('.') || undefined,
      });
    }
    req.valid = parsed.data;
    next();
  };
}

export const PhotoSchema = z.object({ dataUrl: z.string().min(32).max(4_000_000) });
