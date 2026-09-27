import { ImportPanel } from '../components/ImportPanel';
import { CategoryKindsSection } from '../sections/CategoryKindsSection';
import { GeneralSettingsSection } from '../sections/GeneralSettingsSection';
import { GoalsSection } from '../sections/GoalsSection';
import { MappingsSection } from '../sections/MappingsSection';
import { MerchantsSection } from '../sections/MerchantsSection';
import { ImportStats } from '../components/ImportStats';
import type { ImportResultDto } from '../../../shared/types';

/**
 * Страница «Настройки» — контейнер из секций: импорт CSV, финансовые цели, правила
 * категоризации, мерчанты, сферы/тип категорий (декомпозиция: sections/*).
 */

interface Props {
    version: number;
    lastImport: ImportResultDto | null;
    onImported: (result: ImportResultDto) => void;
    onDataChanged: () => void;
}

export function SettingsPage({ version, lastImport, onImported, onDataChanged }: Props): JSX.Element {
    return (
        <div>
            <ImportPanel key={`import-${version}`} onImported={onImported} />
            <GeneralSettingsSection version={version} onDataChanged={onDataChanged} />
            <GoalsSection version={version} onDataChanged={onDataChanged} />
            <MappingsSection version={version} onDataChanged={onDataChanged} />
            <MerchantsSection version={version} onDataChanged={onDataChanged} />
            <CategoryKindsSection version={version} onDataChanged={onDataChanged} />
            {lastImport !== null && (
                <div className="panel">
                    <h2>Последний импорт</h2>
                    <ImportStats result={lastImport} />
                </div>
            )}
        </div>
    );
}
