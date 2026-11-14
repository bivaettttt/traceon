import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  MarkerType,
  type Edge as FlowEdge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { download, type Content, type Graph } from "./api";
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
  return (
    <section className="panel">
      <div className="panelhead">
        <h2>{title}</h2>
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
  return <p className="pad muted">{pending ? "Загрузка…" : empty}</p>;
}
export function Grid({
  columns,
  rows,
}: {
  columns: string[];
  rows: ReactNode[][];
}) {
  return rows.length ? (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
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
export function Export({ path }: { path: string }) {
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="actions">
      {["json", "csv"].map((f) => (
        <button key={f} onClick={() => void download(path, f).catch(setError)}>
          {f.toUpperCase()}
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
export function Diagram({
  graph,
  highlight = [],
}: {
  graph: Graph;
  highlight?: string[];
}) {
  const [selection, setSelection] = useState("");
  const [filter, setFilter] = useState("");
  const nodes = useMemo<Node[]>(
    () =>
      graph.nodes
        .filter((n) => !filter || n.kind === filter)
        .map((n, i) => ({
          id: n.id,
          position: { x: (i % 4) * 245, y: Math.floor(i / 4) * 125 },
          data: {
            label: (
              <>
                <strong>{n.code}</strong>
                <div>{n.display_title ?? n.title}</div>
              </>
            ),
          },
          style: {
            borderColor: n.latest_id ? "#6550b2" : "#7b8b8c",
            width: 195,
            background: n.latest_id ? "#f4efff" : "white",
          },
        })),
    [graph.nodes, filter],
  );
  const edges = useMemo<FlowEdge[]>(
    () =>
      graph.links
        .filter(
          (e) =>
            nodes.some((n) => n.id === e.source_id) &&
            nodes.some((n) => n.id === e.target_id),
        )
        .map((e) => ({
          id: e.id,
          source: e.source_id,
          target: e.target_id,
          label: e.kind,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: {
            stroke: highlight.includes(e.id)
              ? "#6741c5"
              : e.stale
                ? "#bc7622"
                : "#758198",
            strokeWidth: highlight.includes(e.id) ? 3 : 1.5,
            strokeDasharray: e.stale ? "5 4" : undefined,
          },
          labelStyle: { fontSize: 10 },
        })),
    [graph.links, nodes, highlight],
  );
  const current = graph.nodes.find((n) => n.id === selection);
  return (
    <>
      <div className="pad toolbar">
        <label>
          Тип узла
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Все</option>
            {[...new Set(graph.nodes.map((n) => n.kind))].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        {current && (
          <p>
            <strong>{current.code}</strong> ·{" "}
            {current.display_title ?? current.title} · {current.kind}
          </p>
        )}
      </div>
      <div className="flow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          minZoom={0.2}
          nodesDraggable={false}
          onNodeClick={(_, n) => setSelection(n.id)}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </>
  );
}
