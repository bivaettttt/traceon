import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Background,
  Controls,
  Handle,
  ReactFlow,
  MarkerType,
  Position,
  type Edge as FlowEdge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Graph } from "./api";

type TraceNode = Node<{ code: string; title: string }>;
function TraceNodeLabel({ data }: NodeProps<TraceNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} id="in-left" />
      <Handle type="source" position={Position.Left} id="out-left" />
      <strong>{data.code}</strong>
      <div>{data.title}</div>
      <Handle type="target" position={Position.Right} id="in-right" />
      <Handle type="source" position={Position.Right} id="out-right" />
    </>
  );
}
const nodeTypes = { trace: TraceNodeLabel };
const noPath: string[] = [];
const fitOptions = { padding: 0.12, maxZoom: 1 };
const ariaLabels = {
  "node.a11yDescription.default":
    "Enter или пробел выбирают узел. Escape снимает выделение.",
  "controls.ariaLabel": "Масштаб графа",
  "controls.zoomIn.ariaLabel": "Увеличить масштаб",
  "controls.zoomOut.ariaLabel": "Уменьшить масштаб",
  "controls.fitView.ariaLabel": "Показать весь граф",
};

function layout(graph: Graph, origin?: string) {
  const sorted = [...graph.nodes].sort((a, b) => a.code.localeCompare(b.code));
  const adjacent = new Map(sorted.map((node) => [node.id, new Set<string>()]));
  for (const edge of graph.links) {
    adjacent.get(edge.source_id)?.add(edge.target_id);
    adjacent.get(edge.target_id)?.add(edge.source_id);
  }
  const ranks = new Map<string, number>();
  const columns = new Map<number, string[]>();
  const busiest = sorted.reduce<string | undefined>(
    (best, node) =>
      best === undefined ||
      adjacent.get(node.id)!.size > adjacent.get(best)!.size
        ? node.id
        : best,
    undefined,
  );
  const roots = [origin ?? busiest, ...sorted.map((node) => node.id)];

  for (const root of roots) {
    if (!root || ranks.has(root) || !adjacent.has(root)) continue;
    const queue = [root];
    ranks.set(root, 0);
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      const rank = ranks.get(id)!;
      const column = columns.get(rank);
      if (column) column.push(id);
      else columns.set(rank, [id]);
      for (const next of adjacent.get(id)!) {
        if (ranks.has(next)) continue;
        ranks.set(next, rank + 1);
        queue.push(next);
      }
    }
  }
  return new Map(
    [...columns].flatMap(([rank, ids]) =>
      ids.map(
        (id, index) =>
          [
            id,
            { x: rank * 285, y: (index - (ids.length - 1) / 2) * 99 },
          ] as const,
      ),
    ),
  );
}

export function Diagram({
  graph,
  highlight = noPath,
  origin,
  registry,
  impact,
}: {
  graph: Graph;
  highlight?: string[];
  origin?: string;
  registry?: string;
  impact?: string;
}) {
  const [selection, setSelection] = useState(origin ?? "");
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"canvas" | "list">(() =>
    window.matchMedia("(max-width: 660px)").matches ? "list" : "canvas",
  );
  const [scope, setScope] = useState(origin && registry ? "near" : "all");
  const byId = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );
  const path = useMemo(() => new Set(highlight), [highlight]);
  const close = useMemo(() => {
    const ids = new Set([origin]);
    for (const edge of graph.links) {
      if (edge.source_id === origin) ids.add(edge.target_id);
      if (edge.target_id === origin) ids.add(edge.source_id);
    }
    return ids;
  }, [graph.links, origin]);
  const shown = useMemo(
    () => graph.nodes.filter((node) => scope === "all" || close.has(node.id)),
    [graph.nodes, scope, close],
  );
  const shownIds = useMemo(
    () => new Set(shown.map((node) => node.id)),
    [shown],
  );
  const graphLinks = useMemo(
    () =>
      graph.links.filter(
        (edge) => shownIds.has(edge.source_id) && shownIds.has(edge.target_id),
      ),
    [graph.links, shownIds],
  );
  const positions = useMemo(
    () => layout({ nodes: shown, links: graphLinks }, origin),
    [shown, graphLinks, origin],
  );
  const current = byId.get(selection);
  const nodes = useMemo<Node[]>(
    () =>
      shown.map((node) => ({
        id: node.id,
        position: positions.get(node.id)!,
        type: "trace",
        ariaLabel: node.code + " · " + (node.display_title ?? node.title),
        selected: node.id === selection,
        data: {
          code: node.code,
          title: node.display_title ?? node.title,
        },
        className: [
          "trace-node",
          node.latest_id ? "trace-node-requirement" : "",
          filter && filter !== node.kind && node.id !== selection
            ? "trace-node-muted"
            : "",
        ].join(" "),
      })),
    [shown, positions, selection, filter],
  );
  const edges = useMemo<FlowEdge[]>(
    () =>
      graphLinks.map((edge) => {
        const highlighted = path.has(edge.id);
        const connected =
          edge.source_id === selection || edge.target_id === selection;
        const color = highlighted
          ? "#6539b0"
          : edge.stale
            ? "#8a5508"
            : connected
              ? "#4e3486"
              : "#82778d";
        const reverse =
          positions.get(edge.source_id)!.x > positions.get(edge.target_id)!.x;
        return {
          id: edge.id,
          source: edge.source_id,
          target: edge.target_id,
          sourceHandle: reverse ? "out-left" : "out-right",
          targetHandle: reverse ? "in-right" : "in-left",
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, color },
          style: {
            stroke: color,
            strokeWidth: highlighted ? 3 : connected ? 2 : 1.4,
            strokeDasharray: edge.stale ? "5 4" : undefined,
          },
          ariaLabel:
            byId.get(edge.source_id)?.code +
            " → " +
            edge.kind +
            " → " +
            byId.get(edge.target_id)?.code,
          selectable: false,
        };
      }),
    [graphLinks, path, selection, byId, positions],
  );
  const visibleLinks = graphLinks.filter((edge) =>
    view === "list"
      ? !filter ||
        byId.get(edge.source_id)?.kind === filter ||
        byId.get(edge.target_id)?.kind === filter
      : path.has(edge.id) ||
        edge.source_id === selection ||
        edge.target_id === selection,
  );
  return (
    <>
      <div className="pad toolbar">
        <div
          className="actions"
          aria-label="Представление зависимостей"
          role="group"
        >
          <button
            type="button"
            aria-pressed={view === "canvas"}
            onClick={() => setView("canvas")}
          >
            Граф
          </button>
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            Список связей
          </button>
        </div>
        {origin && registry && (
          <label>
            Область
            <select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value);
                setSelection(origin);
              }}
            >
              <option value="near">Ближайшие связи</option>
              <option value="all">Весь проект</option>
            </select>
          </label>
        )}
        <label>
          Тип узла
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="">Все</option>
            {[...new Set(graph.nodes.map((n) => n.kind))].sort().map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="diagram-legend">
        <strong>Источник → цель</strong> · стрелка показывает направление связи.
        Пунктир означает устаревшую привязку.{" "}
        {highlight.length > 0 &&
          "Утолщённые линии выделяют рёбра пути влияния."}{" "}
        {filter &&
          view === "canvas" &&
          "Узлы других типов приглушены, чтобы сохранить контекст."}
      </p>
      {view === "canvas" ? (
        shown.length > 0 ? (
          <div className="flow">
            <ReactFlow
              key={scope + (origin ?? "")}
              nodes={nodes}
              nodeTypes={nodeTypes}
              edges={edges}
              ariaLabelConfig={ariaLabels}
              fitView
              fitViewOptions={fitOptions}
              minZoom={0.08}
              maxZoom={2}
              nodesDraggable={false}
              nodesConnectable={false}
              edgesFocusable={false}
              deleteKeyCode={null}
              onNodesChange={(changes) => {
                const selected = changes.find(
                  (change) => change.type === "select" && change.selected,
                );
                if (selected?.type === "select") setSelection(selected.id);
                else if (changes.some((change) => change.type === "select"))
                  setSelection("");
              }}
              onNodeClick={(_, node) => setSelection(node.id)}
              onlyRenderVisibleElements={shown.length > 120}
              preventScrolling={false}
            >
              <Background gap={20} color="#dad3e5" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        ) : (
          <p className="pad muted">Узлы ещё не добавлены.</p>
        )
      ) : (
        <div className="pad toolbar">
          <label>
            Выбранный узел
            <select
              value={selection}
              onChange={(event) => setSelection(event.target.value)}
            >
              <option value="">Выберите узел</option>
              {shown.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.code} · {node.display_title ?? node.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {current && (
        <div className="pad graph-inspector">
          <p role="status">
            <code>{current.code}</code> ·{" "}
            <strong>{current.display_title ?? current.title}</strong> ·{" "}
            {current.kind}
          </p>
          <div className="actions">
            {registry && current && (
              <Link to={registry + current.id}>Открыть карточку узла</Link>
            )}
            {impact && current.latest_id && (
              <Link
                to={
                  impact +
                  "?version=" +
                  current.latest_id +
                  "&node=" +
                  current.id
                }
              >
                Анализ влияния узла
              </Link>
            )}
          </div>
        </div>
      )}
      {(visibleLinks.length > 0 || view === "list") && (
        <ul className="diagram-links">
          {visibleLinks.map((edge) => (
            <li
              key={edge.id}
              className={path.has(edge.id) ? "path-edge" : undefined}
            >
              <button
                type="button"
                onClick={() => setSelection(edge.source_id)}
                aria-pressed={selection === edge.source_id}
              >
                {byId.get(edge.source_id)?.code}
              </button>
              <span>
                → <code>{edge.kind}</code> →
              </span>
              <button
                type="button"
                onClick={() => setSelection(edge.target_id)}
                aria-pressed={selection === edge.target_id}
              >
                {byId.get(edge.target_id)?.code}
              </button>
              {edge.stale && <span>Устарела</span>}
            </li>
          ))}
          {visibleLinks.length === 0 && (
            <li>Связей для этого представления нет.</li>
          )}
        </ul>
      )}
    </>
  );
}
