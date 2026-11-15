import { useId, useState, type FormEvent, type ReactNode } from "react";
import { download, type Content } from "./api";
export const short = (id: unknown) => String(id ?? "—").slice(0, 8);
export const datetime = (date: unknown) =>
  date ? new Date(String(date)).toLocaleString("ru-RU") : "—";
export const states: Record<string, string> = {
  DRAFT: "Черновик",
  IN_REVIEW: "На согласовании",
  APPROVED: "Утверждено",
  CHANGES_REQUESTED: "На доработку",
  NEW: "Новый",
  UNDER_ANALYSIS: "На анализе",
  IMPACT_REVIEW: "Проверка влияния",
  REJECTED: "Отклонён",
  IMPLEMENTED: "Выполнен",
  VERIFIED: "Проверен",
  CLOSED: "Закрыт",
  ANALYST: "Аналитик",
  REVIEWER: "Ревьюер",
  PROJECT_MANAGER: "Менеджер проекта",
  CONFIRMED: "Подтверждено",
  DISMISSED: "Отклонено",
};
export const priorities: Record<string, string> = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
  CRITICAL: "Критический",
};
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={
        "badge " +
        (["APPROVED", "CLOSED", "VERIFIED"].includes(value)
          ? "green"
          : ["IN_REVIEW", "IMPACT_REVIEW", "CHANGES_REQUESTED"].includes(value)
            ? "amber"
            : "")
      }
    >
      {states[value] ?? value}
    </span>
  );
}
export function Head({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </header>
  );
}
export function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const id = useId();
  return (
    <section className="panel" aria-labelledby={id}>
      <div className="panelhead">
        <h2 id={id}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <p className="error" role="alert">
      {error instanceof Error ? error.message : "Ошибка запроса"}
    </p>
  ) : null;
}
export function Wait({
  pending,
  empty = "Записей пока нет.",
}: {
  pending?: boolean;
  empty?: string;
}) {
  return (
    <p className="pad muted" role="status">
      {pending ? "Загрузка…" : empty}
    </p>
  );
}
export function Grid({
  columns,
  rows,
  responsive = false,
}: {
  columns: string[];
  rows: ReactNode[][];
  responsive?: boolean;
}) {
  return rows.length ? (
    <div className="tablewrap">
      <table className={responsive ? "responsive-table" : undefined}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th scope="col" key={i}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>
                  {responsive && (
                    <span className="cell-label" aria-hidden="true">
                      {columns[j]}
                    </span>
                  )}
                  {responsive ? (
                    <span className="cell-value">{cell}</span>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Wait />
  );
}
export function data(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget)) as Record<
    string,
    string
  >;
}
export function Json({ value }: { value: unknown }) {
  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}
export function Export({ path, scope }: { path: string; scope?: string }) {
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="actions">
      {["json", "csv"].map((f) => (
        <button key={f} onClick={() => void download(path, f).catch(setError)}>
          {f.toUpperCase()}
          {scope && " " + scope}
        </button>
      ))}
      <ErrorBox error={error} />
    </div>
  );
}
export function ContentFields({ value }: { value?: Content }) {
  return (
    <>
      <label>
        Заголовок
        <input name="title" required defaultValue={value?.title} />
      </label>
      <label>
        Описание
        <textarea name="description" defaultValue={value?.description} />
      </label>
      <label>
        Обоснование
        <textarea name="rationale" defaultValue={value?.rationale} />
      </label>
      <label>
        Приоритет
        <select name="priority" defaultValue={value?.priority ?? "MEDIUM"}>
          {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label>
        Источник
        <input name="source" defaultValue={value?.source} />
      </label>
      <label>
        Критерии приёмки
        <textarea name="criteria" defaultValue={value?.criteria} />
      </label>
      <label>
        Бизнес-правила
        <textarea name="rules" defaultValue={value?.rules} />
      </label>
      <label>
        Причина редакции
        <input name="reason" defaultValue={value?.reason} />
      </label>
    </>
  );
}
