import type { Row, Version } from "./api";
import { Json, priorities, states } from "./ui";

export type Snapshot = {
  requirements: { id: string; code: string; version: Version }[];
  artifacts: Row[];
  links: Row[];
};

type DiffRecord = Record<string, unknown>;
type DiffGroup = {
  added: DiffRecord[];
  removed: DiffRecord[];
  changed: { before: DiffRecord; after: DiffRecord }[];
};

export type Diff = Record<keyof Snapshot, DiffGroup>;
const categories = {
  requirements: "Требования",
  artifacts: "Артефакты",
  links: "Связи",
} satisfies Record<keyof Snapshot, string>;
const fields: Record<string, string> = {
  code: "Код",
  title: "Название",
  description: "Описание",
  rationale: "Обоснование",
  priority: "Приоритет",
  status: "Статус",
  number: "Версия",
  revision: "Номер правки",
  source: "Источник",
  criteria: "Критерии приёмки",
  rules: "Бизнес-правила",
  reason: "Причина редакции",
  release: "Релиз",
  kind: "Тип",
  source_id: "Источник связи",
  target_id: "Цель связи",
  source_version: "Привязка к версии источника",
  target_version: "Привязка к версии цели",
  active: "Активность",
  stale: "Устаревшая привязка",
};

function display(field: string, value: unknown, labels: Map<string, string>) {
  if (value === undefined) return "Поле отсутствует";
  if (value === null) return "Нет значения";
  if (value === "") return "Пустая строка";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  const text = String(value);
  if (field === "status") return states[text] ?? text;
  if (field === "priority") return priorities[text] ?? text;
  if (field === "number") return "v" + text;
  return labels.get(text) ?? text;
}

function content(record: DiffRecord | undefined) {
  if (!record) return {};
  const { version, ...rest } = record;
  return version && typeof version === "object"
    ? { ...rest, ...version }
    : rest;
}

function itemTitle(
  kind: keyof Snapshot,
  item: DiffRecord,
  labels: Map<string, string>,
) {
  if (kind === "links")
    return (
      display("source_id", item.source_id, labels) +
      " → " +
      item.kind +
      " → " +
      display("target_id", item.target_id, labels)
    );
  return [item.code, content(item).title].filter(Boolean).join(" · ");
}

export function BaselineDiff({
  diff,
  labels,
}: {
  diff: Diff;
  labels: Map<string, string>;
}) {
  return (
    <div className="baseline-diff">
      {(Object.keys(categories) as (keyof Snapshot)[]).map((kind) => {
        const { added, removed, changed } = diff[kind];
        const records = [
          ...changed.map(({ before, after }) => ({
            status: "Изменено",
            before,
            after,
          })),
          ...added.map((after) => ({
            status: "Добавлено",
            before: undefined,
            after,
          })),
          ...removed.map((before) => ({
            status: "Удалено",
            before,
            after: undefined,
          })),
        ];
        return (
          <section className="diff-section" key={kind}>
            <h3>{categories[kind]}</h3>
            <p className="diff-count">
              Добавлено: {added.length} · Удалено: {removed.length} · Изменено:{" "}
              {changed.length}
            </p>
            {records.length === 0 && <p className="muted">Различий нет.</p>}
            {records.map(({ status, before, after }) => {
              const record = (after ?? before)!;
              const old = content(before);
              const next = content(after);
              const keys = Object.keys(fields).filter(
                (key) => !Object.is(old[key], next[key]),
              );
              return (
                <article className="diff-item" key={String(record.id)}>
                  <header>
                    <span
                      className={
                        "diff-tag " +
                        (after && before
                          ? "modified"
                          : after
                            ? "added"
                            : "removed")
                      }
                    >
                      {status}
                    </span>
                    <h4>{itemTitle(kind, record, labels)}</h4>
                  </header>
                  {keys.length ? (
                    <dl className="diff-fields">
                      {keys.map((field) => (
                        <div key={field}>
                          <dt>{fields[field]}</dt>
                          <dd>
                            <small>Было</small>
                            {before
                              ? display(field, old[field], labels)
                              : "Запись отсутствует"}
                          </dd>
                          <dd>
                            <small>Стало</small>
                            {after
                              ? display(field, next[field], labels)
                              : "Запись отсутствует"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="muted">
                      Изменились служебные атрибуты. Подробности доступны в
                      JSON.
                    </p>
                  )}
                </article>
              );
            })}
          </section>
        );
      })}
      <details>
        <summary>Технические данные сравнения (JSON)</summary>
        <Json value={diff} />
      </details>
    </div>
  );
}
