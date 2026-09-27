import type { Db } from '../db.js';
import { badRequest, notFound } from '../http.js';
import type { GoalDto, GoalInputDto } from '../../../shared/types.js';

/**
 * CRUD финансовых целей — минимальный вид (осознанный урезанный камбэк после отказа от
 * полной фичи с categories[]/прогрессом): просто имя + сумма, без автоматического
 * прогресса по операциям.
 */

interface GoalRow {
    id: number;
    name: string;
    amount_kopecks: number;
}

function toDto(row: GoalRow): GoalDto {
    return { id: row.id, name: row.name, amountKopecks: row.amount_kopecks };
}

function assertAmountValid(amountKopecks: number): void {
    if (!(amountKopecks > 0) || !Number.isSafeInteger(amountKopecks)) {
        throw badRequest('amountKopecks должен быть положительным целым числом (копейки)');
    }
}

export function listGoals(db: Db): GoalDto[] {
    return db.prepare<[], GoalRow>('SELECT * FROM goals ORDER BY id').all().map(toDto);
}

export function getGoalOr404(db: Db, id: number): GoalDto {
    const row = db.prepare<[number], GoalRow>('SELECT * FROM goals WHERE id = ?').get(id);
    if (row === undefined) {
        throw notFound(`Цель с id=${id} не найдена`);
    }
    return toDto(row);
}

export function createGoal(db: Db, input: GoalInputDto): GoalDto {
    assertAmountValid(input.amountKopecks);
    const result = db
        .prepare('INSERT INTO goals (name, amount_kopecks, created_at) VALUES (?, ?, ?)')
        .run(input.name, input.amountKopecks, new Date().toISOString());
    return getGoalOr404(db, Number(result.lastInsertRowid));
}

export function updateGoal(db: Db, id: number, input: GoalInputDto): GoalDto {
    getGoalOr404(db, id);
    assertAmountValid(input.amountKopecks);
    db.prepare('UPDATE goals SET name = ?, amount_kopecks = ? WHERE id = ?').run(input.name, input.amountKopecks, id);
    return getGoalOr404(db, id);
}

export function deleteGoal(db: Db, id: number): void {
    getGoalOr404(db, id);
    db.prepare('DELETE FROM goals WHERE id = ?').run(id);
}
