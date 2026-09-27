/**
 * Спиннер загрузки (стиль .spinner из styles.css). Переиспользуется вместо
 * копирования `<div className="spinner" />` по компонентам.
 */
export function Spinner(): JSX.Element {
    return <div className="spinner" aria-hidden="true" />;
}
