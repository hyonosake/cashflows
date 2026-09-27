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

/** Форма «текстовое поле + кнопка добавить» — используется и для новой категории, и для новой сферы. */
export function InlineNameForm({ id, label, placeholder, value, onChange, submitting, submitLabel, onSubmit }: Props): JSX.Element {
    return (
        <form
            className="form-grid"
            style={{ marginBottom: 16, alignItems: 'end' }}
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
            <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitLabel}
            </button>
        </form>
    );
}
