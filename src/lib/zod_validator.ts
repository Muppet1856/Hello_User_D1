import { z } from 'zod'

export const roleEnum = z.enum(['admin', 'org_admin', 'team_admin', 'statistician', 'member', 'guest'])

export const magicLinkRequestSchema = z.object({
  email: z.string().email(),
})

export const magicLinkVerifySchema = z.object({
  email: z.string().email(),
  token: z.string().min(4),
})

const slugPattern = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase and may only contain hyphenated segments')

export const organizationPayloadSchema = z.object({
  name: z.string().min(2),
  slug: slugPattern,
})

export const teamPayloadSchema = z.object({
  name: z.string().min(2),
  description: z.string().max(256).optional(),
})

export const teamMemberPayloadSchema = z.object({
  userId: z.string().uuid().or(z.string()),
  role: roleEnum,
})

export const orgMemberPayloadSchema = z.object({
  userId: z.string().uuid().or(z.string()),
  role: roleEnum,
})

export const invitationPayloadSchema = z
  .object({
    email: z.string().email(),
    role: roleEnum,
    orgId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
    expiresInMinutes: z.number().int().positive().max(60 * 24 * 30).optional(),
  })
  .refine((value) => value.orgId || value.teamId, {
    message: 'An organization or team id is required for invitations',
    path: ['orgId'],
  })
  .refine((value) => !(value.orgId && value.teamId), {
    message: 'Choose either an organization or a team scope, not both',
    path: ['teamId'],
  })

export const userUpdateSchema = z.object({
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  avatarUrl: z.string().url().optional(),
})

export const adminUserCreateSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
})

export const passkeyRegisterSchema = z.object({
  userId: z.string().uuid().or(z.string()),
  name: z.string().min(2),
})

export const passkeyAuthSchema = z.object({
  credentialId: z.string().min(10),
})
