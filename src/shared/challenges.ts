import { z } from 'zod';

export const exampleSchema = z.object({ label: z.string().min(1), input: z.array(z.unknown()), output: z.unknown() }).strict();
export const challengeTestSchema = z.union([
  z.object({ name: z.string().min(1).max(180), input: z.array(z.unknown()), expected: z.unknown() }).strict(),
  z.object({ name: z.string().min(1).max(180), input: z.array(z.unknown()), error: z.string().min(1) }).strict(),
]);
export const challengeSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1), eyebrow: z.string().min(1),
  category: z.enum(['practical', 'algorithms']),
  language: z.enum(['javascript', 'typescript']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  topics: z.array(z.string().min(1)).min(1),
  skills: z.array(z.string().min(1)).min(1),
  targetRoles: z.array(z.enum(['frontend', 'backend', 'fullstack', 'general'])).min(1),
  exerciseType: z.enum(['function', 'react-component', 'sql-query', 'backend-api']),
  prerequisites: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).default([]),
  summary: z.string().min(1), durationMinutes: z.number().int().min(1).max(240),
  functionName: z.string().regex(/^[A-Za-z_$][\w$]*$/),
  requirements: z.array(z.string().min(1)).min(1), starterCode: z.string().min(1).max(65536),
  hints: z.array(z.string().min(1)), examples: z.array(exampleSchema).min(1),
  tests: z.array(challengeTestSchema).min(1), referenceCode: z.string().min(1).max(65536),
}).strict();

export type Example = z.infer<typeof exampleSchema>;
export type ChallengeTest = z.infer<typeof challengeTestSchema>;
export type Challenge = z.infer<typeof challengeSchema>;
export type PublicChallenge = Omit<Challenge, 'referenceCode'>;

export function publicChallenge(challenge: Challenge): PublicChallenge {
  const { referenceCode: _referenceCode, ...visible } = challenge;
  return visible;
}
