/**
 * Баннер ошибки (`.message.message-error`): единый вид сообщений об ошибках
 * загрузки и валидации. Скрытые детали 400 передаются второй строкой.
 */
interface Props {
    message: string;
    details?: string;
}

export function ErrorBanner({ message, details }: Props): JSX.Element {
    return (
        <div className="message message-error" role="alert">
            <b>Ошибка:</b> {message}
            {details !== undefined && details !== '' && <div className="muted">{details}</div>}
        </div>
    );
}
