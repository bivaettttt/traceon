import { BaselineDiff, type Diff, type Snapshot } from "./baseline-diff";
import { Diagram } from "./diagram";
import { useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useContext } from "./context";
import { useData, useWrite, type Report, type Row, type Version } from "./api";
import {
  Badge,
  ErrorBox,
  Export,
  Grid,
  Head,
  Json,
  Panel,
  Wait,
  data,
  datetime,
  short,
  states,
  priorities,
} from "./ui";

export function Changes() {
  const { path, project } = useContext();
  const [query] = useSearchParams();
  const items = useData<Row[]>(path + "/changes");
  const reqs = useData<Row[]>(path + "/requirements");
  const nav = useNavigate();
  const save = useWrite<Row>((r) => nav(r.id));
  return (
    <>
      <Head
        title="Запросы на изменение"
        description="От идеи и оценки влияния до подтверждённого результата"
      />
      <ErrorBox error={items.error ?? save.error} />
      <Panel title="Реестр изменений">
        <Grid
          columns={["Изменение", "Риск", "Статус", "Создано"]}
          rows={(items.data ?? []).map((r) => [
            <Link to={r.id}>{r.title}</Link>,
            String(r.risk),
            <Badge value={r.status} />,
            datetime(r.created_at),
          ])}
        />
      </Panel>
      {project?.role !== "REVIEWER" && (
        <Panel title="Зарегистрировать изменение">
          <form
            className="pad form"
            onSubmit={(e) =>
              save.mutate({ path: path + "/changes", body: data(e) })
            }
          >
            <label>
              Требование
              <select
                name="node_id"
                required
                key={reqs.isPending ? "loading" : "ready"}
                defaultValue={query.get("requirement") ?? ""}
              >
                <option value="">Выберите</option>
                {reqs.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} · {r.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Название
              <input name="title" required />
            </label>
            <label>
              Причина
              <input name="reason" required />
            </label>
            <label>
              Предложение
              <textarea name="proposal" required />
            </label>
            <label>
              Риск
              <select name="risk">
                <option>MEDIUM</option>
                <option>LOW</option>
                <option>HIGH</option>
              </select>
            </label>
            <button className="primary" disabled={save.isPending}>
              Создать запрос
            </button>
          </form>
        </Panel>
      )}
    </>
  );
}
const transitions: Record<string, string[]> = {
  NEW: ["UNDER_ANALYSIS"],
  UNDER_ANALYSIS: ["IMPACT_REVIEW"],
  IMPACT_REVIEW: ["APPROVED", "REJECTED", "UNDER_ANALYSIS"],
  APPROVED: ["IMPLEMENTED"],
  IMPLEMENTED: ["VERIFIED"],
  VERIFIED: ["CLOSED"],
};
export function Change() {
  const { id } = useParams();
  const { path, project, user } = useContext();
  const nav = useNavigate();
  const endpoint = path + "/changes/" + id;
  const change = useData<Row & { analyses: Row[]; history: Row[] }>(endpoint);
  const node = useData<{ node: Row; versions: Version[] }>(
    path + "/nodes/" + change.data?.node_id,
    Boolean(change.data),
  );
  const save = useWrite();
  const analyze = useWrite<Row>((r) => nav("../impact/" + r.id));
  const [version, setVersion] = useState("");
  const latest = change.data?.analyses[0];
  const latestReport = useData<Report>(
    path + "/analyses/" + latest?.id,
    Boolean(latest),
  );
  if (change.isPending) return <Wait pending />;
  if (change.error) return <ErrorBox error={change.error} />;
  const item = change.data;
  const reviewer = project?.role === "REVIEWER";
  const allowed =
    reviewer === (item.status === "IMPACT_REVIEW") &&
    !(reviewer && item.author === user.id)
      ? (transitions[item.status] ?? [])
      : [];
  const report = latestReport.data;
  const missing = report
    ? report.snapshot.findings.length - report.decisions.length
    : null;
  const blocker = !latest
    ? "Сначала запустите анализ влияния."
    : report?.stale
      ? "Граф изменился. Нужен новый анализ."
      : missing
        ? "Оцените оставшиеся находки: " + missing + "."
        : "";
  const lifecycle = [
    "NEW",
    "UNDER_ANALYSIS",
    "IMPACT_REVIEW",
    "APPROVED",
    "IMPLEMENTED",
    "VERIFIED",
    "CLOSED",
  ];
  return (
    <>
      <Link to="../changes">← Реестр изменений</Link>
      <Head title={item.title} description={"CR-" + short(item.id)}>
        <Badge value={item.status} />
      </Head>
      <ErrorBox
        error={save.error ?? analyze.error ?? node.error ?? latestReport.error}
      />
      <ol className="lifecycle" aria-label="Ход изменения">
        {lifecycle.map((status) => (
          <li
            key={status}
            aria-current={item.status === status ? "step" : undefined}
          >
            {states[status]}
          </li>
        ))}
      </ol>
      {item.status === "IMPACT_REVIEW" && !allowed.length && (
        <p className="notice">
          Дальнейшее решение принимает независимый ревьюер.
        </p>
      )}
      <Panel
        title="Предложение"
        action={<Export path={path + "/export/change?identifier=" + id} />}
      >
        <div className="pad stack">
          <p>
            <strong>Причина</strong> {String(item.reason)}
          </p>
          <p>{String(item.proposal)}</p>
          <p>
            Риск запроса · {priorities[String(item.risk)] ?? String(item.risk)}
          </p>
          <Link
            to={
              "../requirements/" +
              item.node_id +
              (item.status === "APPROVED" ? "?change=" + item.id : "")
            }
          >
            {node.data?.node.code ?? "Требование"}
          </Link>
          <details>
            <summary>Идентификатор запроса</summary>
            <code>{item.id}</code>
          </details>
          {Boolean(item.evidence) && (
            <p>Подтверждение проверок: {String(item.evidence)}</p>
          )}
        </div>
      </Panel>
      {allowed.length > 0 && (
        <Panel
          title={
            item.status === "IMPACT_REVIEW"
              ? "Решение по изменению"
              : "Переход состояния"
          }
        >
          {["UNDER_ANALYSIS", "IMPACT_REVIEW"].includes(item.status) &&
            blocker && <p className="notice">{blocker}</p>}
          {item.status === "APPROVED" &&
            !node.data?.versions.some(
              (candidate) =>
                candidate.change_id === item.id &&
                candidate.status === "APPROVED",
            ) && (
              <p className="notice">
                Для отметки выполнения нужна утверждённая редакция, связанная с
                этим запросом.{" "}
                <Link
                  to={"../requirements/" + item.node_id + "?change=" + item.id}
                >
                  Перейти к редакциям
                </Link>
              </p>
            )}
          <form
            key={item.status}
            className="pad toolbar"
            onSubmit={(e) => {
              const body = data(e);
              save.mutate({ path: endpoint + "/transition", body });
            }}
          >
            <label>
              Следующее состояние
              <select name="status">
                {allowed.map((s) => (
                  <option key={s} value={s}>
                    {states[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Комментарий / доказательство
              <input name="comment" required />
            </label>
            <button className="primary" disabled={save.isPending}>
              Выполнить переход
            </button>
          </form>
        </Panel>
      )}
      <Panel title="Отчёты влияния">
        <Grid
          columns={["Анализ", "Эпоха графа", "Дата"]}
          rows={item.analyses.map((r) => [
            <Link to={"../impact/" + r.id}>
              {r.id === latest?.id ? "Последний отчёт" : "Открыть отчёт"} ·{" "}
              {short(r.id)}
            </Link>,
            String(r.epoch),
            datetime(r.created_at),
          ])}
        />
        {!reviewer && item.status === "UNDER_ANALYSIS" && (
          <form
            className="pad toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              analyze.mutate({
                path: path + "/analyses",
                body: { version_id: version, change_id: item.id },
              });
            }}
          >
            <label>
              Исходная версия
              <select
                required
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              >
                <option value="">Выберите</option>
                {node.data?.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.number} · {v.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={analyze.isPending}>
              Запустить анализ
            </button>
          </form>
        )}
      </Panel>
      <Panel title="История процесса">
        <Grid
          columns={["Действие", "Комментарий", "Дата"]}
          rows={item.history.map((r) => [
            String(r.action),
            String(r.detail),
            datetime(r.created_at),
          ])}
        />
      </Panel>
    </>
  );
}
export function ImpactList() {
  const { path, project } = useContext();
  const [query] = useSearchParams();
  const version = query.get("version") ?? "";
  const node = query.get("node");
  const record = useData<{ versions: Version[] }>(
    path + "/nodes/" + node,
    Boolean(node && version),
  );
  const selected = record.data?.versions.find((item) => item.id === version);
  const list = useData<Row[]>(path + "/analyses");
  const requirements = useData<Row[]>(path + "/requirements");
  const nav = useNavigate();
  const run = useWrite<Row>((r) => nav(r.id));
  return (
    <>
      <Head
        title="Анализ влияния"
        description="Сохранённые графы и объясняющие пути"
      />
      <ErrorBox error={list.error ?? run.error ?? record.error} />
      {project?.role !== "REVIEWER" && (
        <Panel title="Новый анализ">
          <form
            className="pad toolbar"
            onSubmit={(e) =>
              run.mutate({ path: path + "/analyses", body: data(e) })
            }
          >
            <label>
              Исходное требование
              <select
                name="version_id"
                required
                key={
                  requirements.isPending || (Boolean(node) && record.isPending)
                    ? "loading"
                    : "ready"
                }
                defaultValue={version}
              >
                {selected &&
                  !requirements.data?.some(
                    (item) => item.version_id === version,
                  ) && (
                    <option value={version}>
                      v{selected.number} · {selected.title}
                    </option>
                  )}
                <option value="">Выберите</option>
                {requirements.data?.map((r) => (
                  <option key={r.id} value={r.version_id}>
                    {r.code} · v{r.number} · {r.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={run.isPending}>
              Запустить анализ
            </button>
          </form>
        </Panel>
      )}
      <Panel title="История анализов">
        <Grid
          columns={["Требование", "Отчёт", "Найдено", "Актуальность", "Дата"]}
          rows={(list.data ?? []).map((r) => [
            r.code,
            <Link to={r.id}>{short(r.id)}</Link>,
            String(r.findings),
            r.stale ? "Устарел" : "Актуален",
            datetime(r.created_at),
          ])}
        />
      </Panel>
    </>
  );
}
export function Impact() {
  const { id } = useParams();
  const { path } = useContext();
  const result = useData<Report>(path + "/analyses/" + id);
  const save = useWrite();
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState("");
  const change = useData<Row>(
    path + "/changes/" + result.data?.change_id,
    Boolean(result.data?.change_id),
  );
  if (result.isPending) return <Wait pending />;
  if (result.error) return <ErrorBox error={result.error} />;
  const report = result.data;
  const { graph, version, findings } = report.snapshot;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const visible = findings.filter(
    (finding) => !filter || byId.get(finding.node_id)?.kind === filter,
  );
  const active =
    visible.find((finding) => finding.node_id === selected) ?? visible[0];
  const edges = new Map(graph.links.map((edge) => [edge.id, edge]));
  const decisions = new Map(report.decisions.map((d) => [d.node_id, d]));
  const direct = findings.filter((f) => f.depth === 1).length;
  const stale = findings.filter((f) => f.stale).length;
  return (
    <>
      <Link
        to={report.change_id ? "../changes/" + report.change_id : "../impact"}
      >
        ← {report.change_id ? "Запрос на изменение" : "История анализов"}
      </Link>
      <Head
        title="Анализ влияния"
        description={
          byId.get(version.node_id)?.code +
          " · v" +
          version.number +
          " · " +
          version.title
        }
      >
        <Export path={path + "/export/impact?identifier=" + id} />
      </Head>
      <ErrorBox error={save.error} />
      {report.stale && (
        <p className="notice">
          Граф изменился после анализа. Снимок сохранён для истории.
        </p>
      )}
      <ul className="impact-summary" aria-label="Сводка влияния">
        <li>
          <strong>{direct}</strong> прямых
        </li>
        <li>
          <strong>{findings.length - direct}</strong> косвенных
        </li>
        <li>
          <strong>{stale}</strong> с устаревшей привязкой
        </li>
        <li role="status">
          <strong>{findings.length - decisions.size}</strong> ждут оценки
        </li>
      </ul>
      {report.snapshot.missing_traceability && (
        <p className="notice">
          У исходной версии отсутствует актуальный путь влияния.
        </p>
      )}
      <div className="work-columns impact-columns">
        <Panel
          title="Затронутые элементы"
          action={
            <label>
              Тип
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">Все</option>
                {[
                  ...new Set(
                    findings.map((f) => byId.get(f.node_id)?.kind ?? ""),
                  ),
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
          }
        >
          {visible.length ? (
            <ul className="findings">
              {visible.map((finding) => {
                const node = byId.get(finding.node_id);
                const decision = decisions.get(finding.node_id);
                return (
                  <li key={finding.node_id}>
                    <button
                      type="button"
                      aria-pressed={active?.node_id === finding.node_id}
                      onClick={() => setSelected(finding.node_id)}
                    >
                      <span>
                        <code>{node?.code}</code>{" "}
                        <strong>{node?.display_title ?? node?.title}</strong>
                      </span>
                      <span className="finding-meta">
                        {node?.kind} ·{" "}
                        {finding.depth === 1 ? "Прямое" : "Косвенное"} ·{" "}
                        {finding.depth} шага(-ов)
                        {finding.stale ? " · Устарела привязка" : ""}
                      </span>
                      <Badge value={decision?.decision ?? "Ожидает оценки"} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Wait empty="Затронутых элементов для выбранного типа нет." />
          )}
        </Panel>
        {active && (
          <Panel title={"Объяснение · " + byId.get(active.node_id)?.code}>
            <p className="pad muted">
              Анализ отсчитывает путь от изменённой версии. Исходное направление
              связи приведено для каждого шага.
            </p>
            <ol className="steps impact-path">
              {active.path.map((step) => {
                const edge = edges.get(step.link_id);
                const code = (id: string) => byId.get(id)?.code ?? id;
                return (
                  <li key={step.link_id}>
                    <strong>
                      {code(step.from)} → {code(step.to)}
                    </strong>
                    {edge && (
                      <span>
                        Связь:{" "}
                        <code>
                          {code(edge.source_id)} → {edge.kind} →{" "}
                          {code(edge.target_id)}
                        </code>
                      </span>
                    )}
                    <span>
                      {edge && edge.target_id === step.from
                        ? "Обход против стрелки"
                        : "Обход по стрелке"}
                      {step.stale ? " · Устаревшая привязка" : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="pad finding-next">
              <Link to={"../requirements/" + active.node_id}>
                Открыть затронутый объект
              </Link>
              {decisions.get(active.node_id) && (
                <p className="bodytext">
                  Комментарий: {decisions.get(active.node_id)?.comment}
                </p>
              )}
              {(report.stale ||
                (report.change_id &&
                  change.data?.status !== "UNDER_ANALYSIS")) && (
                <p>Оценки доступны для чтения.</p>
              )}
            </div>
            {!report.stale &&
              (!report.change_id ||
                change.data?.status === "UNDER_ANALYSIS") && (
                <form
                  className="pad toolbar"
                  key={active.node_id}
                  onSubmit={(e) =>
                    save.mutate({
                      path:
                        path +
                        "/analyses/" +
                        id +
                        "/decisions/" +
                        active.node_id,
                      method: "PUT",
                      body: data(e),
                    })
                  }
                >
                  <label>
                    Решение
                    <select
                      name="decision"
                      defaultValue={
                        decisions.get(active.node_id)?.decision ?? "CONFIRMED"
                      }
                    >
                      <option value="CONFIRMED">Подтвердить</option>
                      <option value="DISMISSED">Отклонить</option>
                    </select>
                  </label>
                  <label>
                    Комментарий
                    <input
                      name="comment"
                      required
                      defaultValue={decisions.get(active.node_id)?.comment}
                    />
                  </label>
                  <button className="primary" disabled={save.isPending}>
                    Сохранить оценку
                  </button>
                </form>
              )}
          </Panel>
        )}
      </div>
      <Panel title="Граф распространения">
        <Diagram
          graph={graph}
          origin={version.node_id}
          highlight={active?.path.map((step) => step.link_id)}
        />
      </Panel>
    </>
  );
}
export function Baselines() {
  const { path, project } = useContext();
  const list = useData<Row[]>(path + "/baselines");
  const save = useWrite<Row>((r) => setSelected(r.id));
  const [selected, setSelected] = useState("");
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const snapshot = useData<{ name: string; snapshot: Snapshot }>(
    path + "/baselines/" + selected,
    Boolean(selected),
  );
  const savedLeft = useData<{ snapshot: Snapshot }>(
    path + "/baselines/" + left,
    Boolean(left),
  );
  const savedRight = useData<{ snapshot: Snapshot }>(
    path + "/baselines/" + right,
    Boolean(right),
  );
  const liveGraph = useData<Report["snapshot"]["graph"]>(
    path + "/graph",
    Boolean(left && !right),
  );
  const labels = new Map<string, string>();
  for (const snapshot of [
    savedLeft.data?.snapshot,
    savedRight.data?.snapshot,
  ]) {
    for (const node of [
      ...(snapshot?.requirements ?? []),
      ...(snapshot?.artifacts ?? []),
    ])
      labels.set(node.id, node.code);
    for (const node of snapshot?.requirements ?? [])
      labels.set(node.version.id, node.code + " v" + node.version.number);
  }
  for (const node of liveGraph.data?.nodes ?? [])
    labels.set(node.id, node.code);
  const comparePath = "left=" + left + (right ? "&right=" + right : "");
  const compare = useData<Diff>(
    path + "/baseline-comparison?" + comparePath,
    Boolean(left),
  );
  return (
    <>
      <Head
        title="Базовые конфигурации"
        description="Неизменяемые снимки утверждённых версий и связей"
      />
      <ErrorBox
        error={list.error ?? save.error ?? snapshot.error ?? compare.error}
      />
      <Panel title="Снимки">
        <Grid
          columns={["Название", "Требования", "Дата"]}
          rows={(list.data ?? []).map((r) => [
            <button onClick={() => setSelected(r.id)}>{r.name}</button>,
            String(r.count),
            datetime(r.created_at),
          ])}
        />
        {project?.role === "PROJECT_MANAGER" && (
          <form
            className="pad toolbar"
            onSubmit={(e) =>
              save.mutate({ path: path + "/baselines", body: data(e) })
            }
          >
            <label>
              Название baseline
              <input name="name" required />
            </label>
            <button className="primary" disabled={save.isPending}>
              Зафиксировать baseline
            </button>
          </form>
        )}
      </Panel>
      {snapshot.data && (
        <Panel
          title={snapshot.data.name}
          action={
            <Export path={path + "/export/baseline?identifier=" + selected} />
          }
        >
          <Grid
            columns={["Код", "Заголовок", "Версия"]}
            rows={snapshot.data.snapshot.requirements.map((r) => [
              r.code,
              r.version.title,
              "v" + r.version.number,
            ])}
          />
          <details>
            <summary>Артефакты и связи</summary>
            <Json
              value={{
                artifacts: snapshot.data.snapshot.artifacts,
                links: snapshot.data.snapshot.links,
              }}
            />
          </details>
        </Panel>
      )}
      <Panel
        title="Сравнение базовых конфигураций"
        action={
          left && (
            <Export
              path={
                path +
                "/export/baseline-comparison?identifier=" +
                left +
                (right ? "&right=" + right : "")
              }
            />
          )
        }
      >
        <div className="toolbar pad">
          <label>
            Снимок A · Было
            <select value={left} onChange={(e) => setLeft(e.target.value)}>
              <option value="">Выберите</option>
              {list.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Снимок B · Стало
            <select value={right} onChange={(e) => setRight(e.target.value)}>
              <option value="">Текущее состояние</option>
              {list.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!left && (
          <Wait empty="Выберите исходный снимок, чтобы увидеть изменения." />
        )}
        {left && compare.isPending && <Wait pending />}
        <ErrorBox
          error={savedLeft.error ?? savedRight.error ?? liveGraph.error}
        />
        {compare.data && <BaselineDiff diff={compare.data} labels={labels} />}
      </Panel>
    </>
  );
}
type Coverage = {
  covered: number;
  eligible: number;
  requirements: {
    id: string;
    code: string;
    title: string;
    type: string;
    tests: string[];
    designs: string[];
    missing_test: boolean;
    stale_links: number;
    missing_fields: string[];
    unapproved_revision: boolean;
    business: string[];
  }[];
};
export function Quality() {
  const { path } = useContext();
  const results = useData<Coverage>(path + "/coverage");
  const [problems, setProblems] = useState(false);
  return (
    <>
      <Head
        title="Матрица трассируемости"
        description="Проектные решения, тесты и качество требований"
      />
      <ErrorBox error={results.error} />
      <Panel
        title={
          results.data
            ? "Покрытие утверждённых FR · " +
              results.data.covered +
              " из " +
              results.data.eligible
            : "Покрытие"
        }
        action={<Export path={path + "/export/matrix"} />}
      >
        <label className="check pad">
          <input
            type="checkbox"
            checked={problems}
            onChange={(e) => setProblems(e.target.checked)}
          />{" "}
          Только проблемы
        </label>
        <Grid
          columns={[
            "Требование",
            "Бизнес-основание",
            "Проектирование",
            "Тесты",
            "Проверка качества",
          ]}
          rows={(results.data?.requirements ?? [])
            .filter(
              (r) =>
                !problems ||
                r.missing_test ||
                r.stale_links ||
                r.missing_fields.length ||
                r.unapproved_revision,
            )
            .map((r) => [
              <Link to={"../requirements/" + r.id}>
                {r.code} · {r.title}
              </Link>,
              r.business?.join(", ") || "—",
              r.designs.join(", ") || "—",
              r.tests.join(", ") || "—",
              [
                r.missing_test && "Нет теста",
                Boolean(r.stale_links) && "Устаревших: " + r.stale_links,
                r.missing_fields.length &&
                  "Поля: " + r.missing_fields.join(", "),
                r.unapproved_revision && "Редакция не утверждена",
              ]
                .filter(Boolean)
                .join(" · ") || "Проблем не выявлено",
            ])}
        />
      </Panel>
    </>
  );
}
export function Lab() {
  const { path, project } = useContext();
  const reqs = useData<Row[]>(
    path + "/requirements?q=FR-014",
    project?.code === "SERVICEHUB",
  );
  const nav = useNavigate();
  const create = useWrite<Row>((r) => nav("../changes/" + r.id));
  const req = reqs.data?.[0];
  return (
    <>
      <Head
        title="Лаборатория Traceon"
        description="ServiceHub · подтверждение руководителем для чувствительных заявок"
      />
      <Panel title="Сценарий изменения">
        <div className="pad stack">
          <ol className="steps">
            <li>Откройте FR-014 и изучите утверждённую редакцию.</li>
            <li>Создайте запрос и переведите его на анализ.</li>
            <li>
              Проверьте прямое влияние на API и косвенное влияние на компонент,
              данные и тесты.
            </li>
            <li>
              Примите решения по влиянию, передайте запрос ревьюеру и создайте
              новую редакцию.
            </li>
            <li>
              Согласуйте редакцию, зафиксируйте новый baseline и сравните с
              ServiceHub 1.0.
            </li>
          </ol>
          <ErrorBox error={create.error ?? reqs.error} />
          {req ? (
            <div className="actions">
              <Link to={"../requirements/" + req.id}>Открыть FR-014</Link>
              {project?.role !== "REVIEWER" && (
                <button
                  className="primary"
                  disabled={create.isPending}
                  onClick={() =>
                    create.mutate({
                      path: path + "/changes",
                      body: {
                        node_id: req.id,
                        title: "Обязательное подтверждение руководителя",
                        reason:
                          "Снизить риск ошибочного согласования чувствительных заявок",
                        proposal:
                          "Добавить новое состояние и проверку полномочий руководителя.",
                        risk: "HIGH",
                      },
                    })
                  }
                >
                  Создать учебный запрос
                </button>
              )}
            </div>
          ) : (
            <p>Откройте проект ServiceHub в демонстрационном окружении.</p>
          )}
        </div>
      </Panel>
    </>
  );
}
