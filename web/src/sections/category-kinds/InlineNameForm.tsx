interface Props {
    id: string;
    label: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    submitting: boolean;
    submitLabel: string;
    onSubmit: () => void;
}

/** Форма «текстовое поле + кнопка добавить» — используется и для новой категории, и для новой сферы.
 * Кнопка — в `.form-actions` (не внутри `.form-grid`, как остальные формы в приложении): грид
 * растягивает элементы по умолчанию (`justify-items: stretch`), и кнопка как прямой grid-item
 * заняла бы половину ширины ряда наравне с полем ввода. */
export function InlineNameForm({ id, label, placeholder, value, onChange, submitting, submitLabel, onSubmit }: Props): JSX.Element {
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
            }}
        >
            <div className="field">
                <label htmlFor={id}>{label}</label>
                <input
                    id={id}
                    className="input-control"
                    value={value}
                    disabled={submitting}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                />
            </div>
            <div className="form-actions" style={{ marginTop: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitLabel}
                </button>
            </div>
        </form>
    );
}
