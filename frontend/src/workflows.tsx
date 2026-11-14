import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useContext } from "./context";
import { useData, useWrite, type Report, type Row, type Version } from "./api";
import {
  Badge,
  Diagram,
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
} from "./ui";

export function Changes() {
  const { path, project } = useContext();
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
              <select name="node_id" required>
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
  const { path, project } = useContext();
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
  if (change.isPending) return <Wait pending />;
  if (change.error) return <ErrorBox error={change.error} />;
  const item = change.data;
  const reviewer = project?.role === "REVIEWER";
  const allowed =
    reviewer === (item.status === "IMPACT_REVIEW")
      ? (transitions[item.status] ?? [])
      : [];
  return (
    <>
      <Link to="../changes">← Реестр изменений</Link>
      <Head title={item.title} description={"CR-" + short(item.id)}>
        <Badge value={item.status} />
      </Head>
      <ErrorBox error={save.error ?? analyze.error ?? node.error} />
      <Panel
        title="Предложение"
        action={<Export path={path + "/export/change?identifier=" + id} />}
      >
        <div className="pad stack">
          <p>
            <strong>Причина</strong> {String(item.reason)}
          </p>
          <p>{String(item.proposal)}</p>
          <p>Риск {String(item.risk)}</p>
          <Link to={"../requirements/" + item.node_id}>
            {node.data?.node.code ?? "Требование"}
          </Link>
          <p>
            <code>{item.id}</code>
          </p>
          {Boolean(item.evidence) && (
            <p>Подтверждение проверок: {String(item.evidence)}</p>
          )}
        </div>
      </Panel>
      {allowed.length > 0 && (
        <Panel title="Переход состояния">
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
            <Link to={"../impact/" + r.id}>{short(r.id)}</Link>,
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
      <ErrorBox error={list.error ?? run.error} />
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
              <select name="version_id" required>
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
  const active = findings.find((f) => f.node_id === selected) ?? findings[0];
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
      <div className="metrics">
        {[
          ["Прямое влияние", direct],
          ["Косвенное влияние", findings.length - direct],
          ["Устаревшие связи", stale],
          ["Требуют решения", findings.length - decisions.size],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {report.snapshot.missing_traceability && (
        <p className="notice">
          У исходной версии отсутствует актуальный путь влияния.
        </p>
      )}
      <Panel
        title="Затронутые элементы"
        action={
          <label>
            Тип
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
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
        <Grid
          columns={["Элемент", "Тип", "Длина пути", "Актуальность", "Решение"]}
          rows={findings
            .filter((f) => !filter || byId.get(f.node_id)?.kind === filter)
            .map((f) => {
              const n = byId.get(f.node_id);
              return [
                <button onClick={() => setSelected(f.node_id)}>
                  {n?.code} · {n?.display_title}
                </button>,
                n?.kind,
                f.depth,
                f.stale ? "Требует перепривязки" : "Актуальная связь",
                decisions.get(f.node_id)?.decision ?? "Ожидает",
              ];
            })}
        />
      </Panel>
      {active && (
        <Panel title={"Объяснение · " + byId.get(active.node_id)?.code}>
          <ol className="steps">
            {active.path.map((s) => (
              <li key={s.link_id}>
                <code>{byId.get(s.from)?.code}</code> → {s.kind} →{" "}
                <code>{byId.get(s.to)?.code}</code>
                {s.stale ? " · устарела" : ""}
              </li>
            ))}
          </ol>
          {!report.stale &&
            (!report.change_id || change.data?.status === "UNDER_ANALYSIS") && (
              <form
                className="pad toolbar"
                key={active.node_id}
                onSubmit={(e) =>
                  save.mutate({
                    path:
                      path + "/analyses/" + id + "/decisions/" + active.node_id,
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
      <Panel title="Граф распространения">
        <Diagram graph={graph} highlight={active?.path.map((x) => x.link_id)} />
      </Panel>
    </>
  );
}
type Snapshot = {
  requirements: { id: string; code: string; version: Version }[];
  artifacts: Row[];
  links: Row[];
};
type Diff = Record<
  string,
  {
    added: unknown[];
    removed: unknown[];
    changed: { before: unknown; after: unknown }[];
  }
>;
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
            Исходная baseline
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
            Сравнить с
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
        {compare.data &&
          Object.entries(compare.data).map(([kind, v]) => (
            <details key={kind} open={kind === "requirements"}>
              <summary>
                {kind} · +{v.added.length} · −{v.removed.length} · Δ
                {v.changed.length}
              </summary>
              <Json value={v} />
            </details>
          ))}
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
