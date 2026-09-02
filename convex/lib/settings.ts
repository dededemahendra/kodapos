import { v } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import schema from '../schema';

const settingsFields = schema.tables.cafeSettings.validator.fields;
const staffFields = schema.tables.cafeStaff.validator.fields;

/**
 * Everything in this module answers one question: which parts of a
 * `cafeSettings` document are allowed to leave the server.
 *
 * The raw document is NOT safe to return. `integrations[].config` holds live
 * credentials — the Xendit `secretApiKey` + `callbackToken`
 * (`settings.connectQrisProvider`), the WhatsApp `token`
 * (`settings.connectWhatsapp`), and the AI provider `apiKey`
 * (`settings.connectAi`). Anything that ships settings to a client MUST go
 * through a projection here, so there is exactly one place to audit and a new
 * secret field cannot leak through a second, forgotten copy of the redaction.
 */

type Integration = NonNullable<Doc<'cafeSettings'>['integrations']>[number];

/**
 * Strip server-only secrets from `integrations`, keeping only the
 * non-sensitive provider metadata + masked hints the settings screen renders.
 *
 * Every integration whose connect mutation stores a credential — `qris`,
 * `whatsapp`, `ai` — is handled explicitly here. A key with no case falls
 * through with its config intact: those come from the generic
 * `settings.connectIntegration`, which stores owner-entered marketplace
 * metadata (e.g. a GrabFood merchant id) that the settings screen reads back.
 * ADD A CASE HERE whenever a new connect mutation starts storing a secret —
 * and never hand a raw settings document to a client instead.
 */
export function sanitizeIntegrations(integrations: Integration[]): Integration[] {
  return integrations.map((i) => {
    const base = {
      key: i.key,
      connected: i.connected,
      ...(i.connectedAt !== undefined ? { connectedAt: i.connectedAt } : {}),
    };
    if (i.key === 'qris') {
      const c = (i.config ?? {}) as { provider?: string; keyHint?: string };
      return { ...base, config: { provider: c.provider ?? 'xendit', keyHint: c.keyHint ?? '' } };
    }
    if (i.key === 'whatsapp') {
      const c = (i.config ?? {}) as {
        endpoint?: string;
        headerName?: string;
        bodyTemplate?: string;
        tokenHint?: string;
      };
      return {
        ...base,
        config: {
          endpoint: c.endpoint ?? '',
          headerName: c.headerName ?? 'Authorization',
          bodyTemplate: c.bodyTemplate ?? '',
          tokenHint: c.tokenHint ?? '',
        },
      };
    }
    if (i.key === 'ai') {
      const c = (i.config ?? {}) as { provider?: string; model?: string; keyHint?: string };
      return {
        ...base,
        config: {
          provider: c.provider ?? 'openai',
          model: c.model ?? '',
          keyHint: c.keyHint ?? '',
        },
      };
    }
    return i;
  });
}

/**
 * The settings the offline register needs to price and print a cash sale:
 * payment/rounding/service-charge config, the receipt layout, and the tax
 * labels. Deliberately NOT the whole document — `integrations` (credentials)
 * and `notifications` (the owner's email) have no business being written to
 * every till's IndexedDB.
 */
export const registerSettingsValidator = v.object({
  _id: v.id('cafeSettings'),
  _creationTime: v.number(),
  // Field validators come from the schema, so a shape change to any of these
  // groups cannot silently diverge from what the register is typed against.
  cafeId: settingsFields.cafeId,
  payment: settingsFields.payment,
  receipt: settingsFields.receipt,
  taxName: settingsFields.taxName,
  taxInclusive: settingsFields.taxInclusive,
  npwp: settingsFields.npwp,
  updatedAt: settingsFields.updatedAt,
});

/** Project a stored settings document down to {@link registerSettingsValidator}. */
export function projectRegisterSettings(row: Doc<'cafeSettings'>) {
  return {
    _id: row._id,
    _creationTime: row._creationTime,
    cafeId: row.cafeId,
    ...(row.payment !== undefined ? { payment: row.payment } : {}),
    ...(row.receipt !== undefined ? { receipt: row.receipt } : {}),
    ...(row.taxName !== undefined ? { taxName: row.taxName } : {}),
    ...(row.taxInclusive !== undefined ? { taxInclusive: row.taxInclusive } : {}),
    ...(row.npwp !== undefined ? { npwp: row.npwp } : {}),
    updatedAt: row.updatedAt,
  };
}

/**
 * The staff fields the register needs: who can be shown as the cashier on a
 * receipt, and what they are allowed to do. `pinHash`, `hourlyRateIDR`,
 * `phone`, and `email` are excluded — a snapshot is written to device storage,
 * and a wage bill or a password hash on a shared till is not a trade the
 * feature needs to make.
 */
export const registerStaffValidator = v.object({
  _id: v.id('cafeStaff'),
  _creationTime: v.number(),
  cafeId: staffFields.cafeId,
  name: staffFields.name,
  role: staffFields.role,
  archived: staffFields.archived,
  permissions: staffFields.permissions,
});

/** Project a stored staff document down to {@link registerStaffValidator}. */
export function projectRegisterStaff(row: Doc<'cafeStaff'>) {
  return {
    _id: row._id,
    _creationTime: row._creationTime,
    cafeId: row.cafeId,
    name: row.name,
    role: row.role,
    archived: row.archived,
    ...(row.permissions !== undefined ? { permissions: row.permissions } : {}),
  };
}
