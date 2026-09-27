import { z } from 'zod';

/**
 * zod-схемы, зеркалирующие типы shared/types.ts (ARCHITECTURE.md §7).
 * Деньги — целые копейки (безопасные целые), периоды — ISO-форматы.
 */

// --- общие (переиспользуются несколькими сущностями) ---

export const isoDateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'ожидается дата в формате YYYY-MM-DD');

export const operationTypeSchema = z.enum(['income', 'expense']);

export const moneyKopecksSchema = z
    .number({ invalid_type_error: 'ожидается целое число копеек' })
    .int('сумма должна быть целым числом копеек')
    .safe('сумма выходит за пределы безопасного целого');

/** :id в пути — goals, custom-mappings, PUT /operations/:id/category. */
export const idParamSchema = z.object({
    id: z.coerce.number().int().positive('id должен быть положительным целым'),
});

// --- operations ---

export const operationsQuerySchema = z.object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    category: z.string().min(1).optional(),
    categories: z.string().min(1).optional(),
    type: operationTypeSchema.optional(),
    q: z.string().min(1).optional(),
    analyticsOnly: z
        .enum(['true', 'false'])
        .optional()
        .transform((value) => value === undefined ? undefined : value === 'true'),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const operationCategoryInputSchema = z.object({
    categoryUser: z.string().trim().min(1, 'categoryUser обязателен и не может быть пустым'),
});

// --- goals ---

export const goalInputSchema = z.object({
    name: z.string().trim().min(1, 'name обязателен и не может быть пустым'),
    amountKopecks: moneyKopecksSchema.positive('amountKopecks должен быть > 0'),
});

// --- categories (core CRUD + kinds + limits) ---

export const categoryParamSchema = z.object({
    category: z.string().trim().min(1, 'category обязателен'),
});

export const userCategoryInputSchema = z.object({
    name: z.string().trim().min(1, 'name обязателен и не может быть пустым'),
});

export const categoriesQuerySchema = z.object({
    // без scope — все категории пользователя + служебная «Без категории» (для фильтра операций);
    // user — только категории пользователя (для выбора ЦЕЛЕВОЙ категории, например MerchantsSection).
    scope: z.enum(['user']).optional(),
});

export const categoryKindInputSchema = z.object({
    kind: z.enum(['fixed', 'variable', 'reserve']).nullable(),
});

export const categoryLimitInputSchema = z.object({
    monthLimitKopecks: moneyKopecksSchema.positive('monthLimitKopecks должен быть > 0').nullable(),
});

// --- category mappings (mcc-mappings / custom-mappings) ---

export const mccParamSchema = z.object({
    mcc: z.string().trim().regex(/^\d{4}$/, 'mcc должен быть 4-значным кодом'),
});

export const mcMappingInputSchema = z.object({
    mcc: z.string().trim().regex(/^\d{4}$/, 'mcc должен быть 4-значным кодом'),
    targetCategory: z.string().trim().min(1, 'targetCategory обязательна и не может быть пустой'),
});

export const customMappingInputSchema = z.object({
    matchValue: z.string().trim().min(1, 'matchValue обязателен и не может быть пустым'),
    targetCategory: z.string().trim().min(1, 'targetCategory обязательна и не может быть пустой'),
});

// --- category areas (сферы) ---

export const categoryFieldInputSchema = z.object({
    field: z.string().trim().min(1, 'field не может быть пустой строкой').nullable(),
});

export const categoryAreaInputSchema = z.object({
    name: z.string().trim().min(1, 'name обязателен и не может быть пустым'),
});

// --- merchants ---

export const merchantCategoryInputSchema = z.object({
    merchant: z.string().trim().min(1, 'merchant обязателен и не может быть пустым'),
    targetCategory: z.string().trim().min(1, 'targetCategory обязательна и не может быть пустой'),
});

// --- settings ---

export const settingsInputSchema = z.object({
    salaryDays: z.array(z.number().int().min(1).max(31)).max(31, 'не больше 31 дня'),
    salaryAmountKopecks: moneyKopecksSchema.positive('salaryAmountKopecks должен быть > 0').nullable(),
    owedToUserKopecks: moneyKopecksSchema.positive('owedToUserKopecks должен быть > 0').nullable(),
});
