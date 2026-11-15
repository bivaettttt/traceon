import { Diagram } from "./diagram";
import { useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useContext } from "./context";
import { useData, useWrite, type Version, type Graph, type Row } from "./api";
import {
  Badge,
  ContentFields,
  ErrorBox,
  Export,
  Grid,
  Head,
  Panel,
  Wait,
  data,
  datetime,
  states,
  priorities,
} from "./ui";

const types = [
  "BUSINESS",
  "STAKEHOLDER",
  "FUNCTIONAL",
  "NONFUNCTIONAL",
  "TRANSITION",
];
const artifactTypes = [
  "PROCESS",
  "RULE",
  "ENDPOINT",
  "CONTRACT",
  "COMPONENT",
  "ENTITY",
  "DATA_CONTRACT",
  "TEST_CASE",
  "TEST_SUITE",
  "DECISION",
  "DOCUMENT",
  "UI",
];
const linkTypes = [
  "REFINES",
  "DERIVES_FROM",
  "DEPENDS_ON",
  "IMPLEMENTED_BY",
  "VERIFIED_BY",
  "CONSTRAINS",
  "RELATES_TO",
];
const fields: Record<string, string> = {
  description: "Описание",
  rationale: "Обоснование",
  source: "Источник",
  criteria: "Критерии приёмки",
  rules: "Бизнес-правила",
  reason: "Причина редакции",
};
export function Registry() {
  const { path, project } = useContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const group = params.get("group");
  const clauses = new URLSearchParams();
  for (const key of ["q", "kind", "status", "priority", "sort"]) {
    const value = params.get(key);
    if (value) clauses.set(key, value);
  }
  clauses.set("offset", String(offset));
  const list = useData<Row[]>(path + "/requirements?" + clauses);
  const search = params.size ? "?" + params.toString() : "";
  function page(next: number) {
    const copy = new URLSearchParams(params);
    if (next) copy.set("offset", String(next));
    else copy.delete("offset");
    setParams(copy);
  }
  const [open, setOpen] = useState(false);
  const save = useWrite<{ node: Row }>((r) => navigate(r.node.id + search));
  const groups = new Map<string, Row[]>();
  for (const item of list.data ?? []) {
    const key = group ? String(item[group] ?? "Без значения") : "Требования";
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return (
    <>
      <Head
        title="Реестр требований"
        description="Версии, приоритеты и состояние согласования"
      >
        {project?.role !== "REVIEWER" && (
          <button className="primary" onClick={() => setOpen(!open)}>
            {open ? "Закрыть форму" : "Новое требование"}
          </button>
        )}
      </Head>
      <ErrorBox error={save.error ?? list.error} />
      {open && (
        <Panel title="Новое требование">
          <form
            className="form pad"
            onSubmit={(e) =>
              save.mutate({ path: path + "/requirements", body: data(e) })
            }
          >
            <label>
              Код
              <input name="code" placeholder="FR-025" required />
            </label>
            <label>
              Тип
              <select name="kind" defaultValue="FUNCTIONAL">
                {types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <ContentFields />
            <button className="primary" disabled={save.isPending}>
              Создать требование
            </button>
          </form>
        </Panel>
      )}
      <Panel title="Фильтры">
        <form
          className="pad toolbar registry-filters"
          key={clauses.toString() + group}
          onSubmit={(e) => {
            const values = data(e);
            values.q = values.q.trim();
            if (values.sort === "code") delete values.sort;
            setParams(
              new URLSearchParams(
                Object.entries(values).filter(([, value]) => value),
              ),
            );
          }}
        >
          <label>
            Поиск
            <input
              type="search"
              name="q"
              defaultValue={params.get("q") ?? ""}
              placeholder="Код или заголовок"
            />
          </label>
          <details
            className="advanced-filters"
            open={
              ["kind", "status", "priority", "sort", "group"].some(
                (key) => params.has(key) && params.get(key) !== "code",
              ) || undefined
            }
          >
            <summary>Уточнить выборку</summary>
            <div className="filter-fields">
              <label>
                Тип
                <select name="kind" defaultValue={params.get("kind") ?? ""}>
                  <option value="">Все</option>
                  {types.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Статус
                <select name="status" defaultValue={params.get("status") ?? ""}>
                  <option value="">Все</option>
                  {["DRAFT", "IN_REVIEW", "APPROVED", "CHANGES_REQUESTED"].map(
                    (s) => (
                      <option key={s} value={s}>
                        {states[s]}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Приоритет
                <select
                  name="priority"
                  defaultValue={params.get("priority") ?? ""}
                >
                  <option value="">Все</option>
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Сортировка
                <select name="sort" defaultValue={params.get("sort") ?? ""}>
                  <option value="code">Код</option>
                  <option value="title">Заголовок</option>
                  <option value="newest">Новые редакции</option>
                </select>
              </label>
              <label>
                Группировка
                <select name="group" defaultValue={group ?? ""}>
                  <option value="">Без группировки</option>
                  <option value="kind">Тип</option>
                  <option value="status">Статус</option>
                  <option value="priority">Приоритет</option>
                </select>
              </label>
            </div>
          </details>
          <button className="primary">Найти</button>
          <Link to="." className="secondary-link">
            Сбросить
          </Link>
        </form>
      </Panel>
      {list.isPending && <Wait pending />}
      {list.data && (
        <p className="result-count" role="status">
          На странице: <strong>{list.data.length}</strong>
        </p>
      )}
      {list.data?.length === 0 && (
        <Wait empty="Требования по этим фильтрам не найдены." />
      )}
      {[...groups].map(([label, items]) => (
        <Panel key={label} title={states[label] ?? label}>
          <Grid
            responsive
            columns={[
              "Код",
              "Требование",
              "Тип",
              "Версия",
              "Статус",
              "Приоритет",
            ]}
            rows={items.map((r) => [
              <code>{r.code}</code>,
              <Link to={r.id + search}>{r.title}</Link>,
              r.kind,
              "v" + r.number,
              <Badge value={r.status} />,
              priorities[r.priority] ?? r.priority,
            ])}
          />
        </Panel>
      ))}
      <div className="registry-footer">
        <div className="actions">
          <button disabled={!offset} onClick={() => page(offset - 100)}>
            Назад
          </button>
          <button
            disabled={(list.data?.length ?? 0) < 100}
            onClick={() => page(offset + 100)}
          >
            Далее
          </button>
        </div>
        <Export path={path + "/export/registry"} scope="всего реестра" />
      </div>
    </>
  );
}
type Details = { node: Row; versions: Version[]; reviews: Row[]; links: Row[] };
export function Requirement() {
  const { id } = useParams();
  const [query] = useSearchParams();
  const { path, user, project } = useContext();
  const item = useData<Details>(path + "/nodes/" + id);
  const members = useData<Row[]>(path + "/members");
  const changes = useData<Row[]>(path + "/changes");
  const [selected, setSelected] = useState("");
  const [edit, setEdit] = useState(false);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const diff = useData<{
    changes: { field: string; before: string; after: string }[];
  }>(
    path + "/nodes/" + id + "/compare?left=" + left + "&right=" + right,
    Boolean(left && right),
  );
  const save = useWrite<Version>((result) => {
    setEdit(false);
    setSelected(result.id);
  });
  if (item.isPending) return <Wait pending />;
  if (item.error) return <ErrorBox error={item.error} />;
  const { node, versions, reviews, links } = item.data;
  const registryQuery = new URLSearchParams(query);
  registryQuery.delete("version");
  registryQuery.delete("change");
  const current =
    versions.find((v) => v.id === (selected || query.get("version"))) ??
    versions[0];
  const related = changes.data?.filter((change) => change.node_id === id) ?? [];
  const approved = related.filter((change) => change.status === "APPROVED");
  const base = path + "/versions/" + current?.id;
  return (
    <>
      <Link
        className="back-link"
        to={"../requirements" + (registryQuery.size ? "?" + registryQuery : "")}
      >
        ← Реестр требований
      </Link>
      <Head
        title={current?.title ?? node.title}
        description={node.code + " · " + node.kind}
      >
        {current && (
          <div className="record-meta">
            <code>
              v{current.number} / r{current.revision}
            </code>
            <Badge value={current.status} />
            <span className="badge">
              {priorities[current.priority] ?? current.priority}
            </span>
          </div>
        )}
      </Head>
      <nav className="context-bar" aria-label="Действия с требованием">
        <Link to={"../graph?node=" + node.id}>Зависимости</Link>
        {current && (
          <Link to={"../impact?version=" + current.id + "&node=" + node.id}>
            Анализ влияния
          </Link>
        )}
        {current && project?.role !== "REVIEWER" && (
          <Link to={"../changes?requirement=" + node.id}>
            Создать запрос на изменение
          </Link>
        )}
        {current && <Link to="../baselines">Сравнить снимки</Link>}
      </nav>
      <ErrorBox error={save.error ?? members.error ?? changes.error} />
      <div className="split">
        <Panel
          title="Содержание"
          action={
            current && (
              <code>
                v{current.number} / r{current.revision}
              </code>
            )
          }
        >
          {edit ? (
            <form
              className="form pad"
              onSubmit={(e) =>
                save.mutate({
                  path: base,
                  method: "PATCH",
                  body: { ...data(e), revision: current.revision },
                })
              }
            >
              <ContentFields value={current} />
              <button className="primary" disabled={save.isPending}>
                Сохранить черновик
              </button>
              <button type="button" onClick={() => setEdit(false)}>
                Отмена
              </button>
            </form>
          ) : (
            <div className="pad stack">
              {Object.entries(fields)
                .filter(
                  ([f]) => current || f === "description" || f === "source",
                )
                .map(([field, label]) => (
                  <div key={field}>
                    <h3>{label}</h3>
                    <p className="bodytext">
                      {((current
                        ? current[field as keyof Version]
                        : node[field]) as string) || "—"}
                    </p>
                  </div>
                ))}
              {current?.status === "DRAFT" && user.id === current.author && (
                <button onClick={() => setEdit(true)}>
                  Редактировать черновик
                </button>
              )}
            </div>
          )}
        </Panel>
        <div className="requirement-context">
          {current && (
            <Panel
              title={
                current.status === "IN_REVIEW"
                  ? "Согласование редакции"
                  : "Редакции"
              }
            >
              {current.status === "IN_REVIEW" && (
                <p className="pad muted">
                  На согласовании ·{" "}
                  {members.data?.find(
                    (member) => member.id === current.reviewer,
                  )?.name ?? "назначенный ревьюер"}{" "}
                  · версия v{current.number}
                </p>
              )}
              <Grid
                columns={["Версия", "Состояние"]}
                rows={versions.map((v) => [
                  <button
                    aria-pressed={v.id === current?.id}
                    onClick={() => {
                      setSelected(v.id);
                      setEdit(false);
                    }}
                  >
                    v{v.number}
                  </button>,
                  <Badge value={v.status} />,
                ])}
              />
              {current?.status === "DRAFT" && current.author === user.id && (
                <form
                  className="pad form"
                  onSubmit={(e) =>
                    save.mutate({
                      path: base + "/submit",
                      body: { ...data(e), revision: current.revision },
                    })
                  }
                >
                  <label>
                    Ревьюер
                    <select name="reviewer" required>
                      <option value="">Выберите участника</option>
                      {members.data
                        ?.filter(
                          (m) => m.role === "REVIEWER" && m.id !== user.id,
                        )
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button disabled={save.isPending}>
                    Отправить на согласование
                  </button>
                </form>
              )}
              {current?.status === "IN_REVIEW" &&
                current.reviewer === user.id && (
                  <form
                    className="pad form"
                    onSubmit={(e) =>
                      save.mutate({ path: base + "/review", body: data(e) })
                    }
                  >
                    <label>
                      Решение
                      <select name="decision" required defaultValue="">
                        <option value="">Выберите решение</option>
                        <option value="APPROVED">Утвердить</option>
                        <option value="CHANGES_REQUESTED">Вернуть</option>
                      </select>
                    </label>
                    <label>
                      Комментарий
                      <input name="comment" required />
                    </label>
                    <button className="primary" disabled={save.isPending}>
                      Сохранить решение
                    </button>
                  </form>
                )}
              {versions[0] &&
                ["APPROVED", "CHANGES_REQUESTED"].includes(
                  versions[0].status,
                ) &&
                project?.role !== "REVIEWER" && (
                  <form
                    className="pad form"
                    onSubmit={(e) => {
                      const form = data(e);
                      save.mutate({
                        path: path + "/nodes/" + id + "/versions",
                        body: {
                          reason: form.reason,
                          change_id: form.change_id || null,
                        },
                      });
                    }}
                  >
                    <label>
                      Причина новой редакции
                      <input name="reason" required />
                    </label>
                    <label>
                      Согласованный запрос
                      <select
                        name="change_id"
                        key={changes.isPending ? "loading" : "ready"}
                        defaultValue={
                          approved.some(
                            (change) => change.id === query.get("change"),
                          )
                            ? query.get("change")!
                            : ""
                        }
                      >
                        <option value="">Без запроса</option>
                        {approved.map((change) => (
                          <option key={change.id} value={change.id}>
                            {change.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button disabled={save.isPending}>Создать редакцию</button>
                  </form>
                )}
            </Panel>
          )}
          {related.length > 0 && (
            <Panel title="Запросы на изменение">
              <ul className="task-list">
                {related.map((change) => (
                  <li key={change.id}>
                    <Link to={"../changes/" + change.id}>{change.title}</Link>
                    <p>
                      <Badge value={change.status} />
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
      {versions.length > 1 && (
        <Panel title="Сравнение редакций">
          <div className="pad toolbar">
            {[
              [left, setLeft, "Исходная версия"],
              [right, setRight, "Новая версия"],
            ].map(([value, set, label]) => (
              <label key={label as string}>
                {label as string}
                <select
                  value={value as string}
                  onChange={(e) => (set as (v: string) => void)(e.target.value)}
                >
                  <option value="">Выберите</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.number}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <ErrorBox error={diff.error} />
          {diff.data && (
            <Grid
              columns={["Поле", "До", "После"]}
              rows={diff.data.changes.map((c) => [
                fields[c.field] ?? c.field,
                c.before,
                c.after,
              ])}
            />
          )}
        </Panel>
      )}
      <Panel title="Связи и проверки">
        <Grid
          columns={["Источник", "Отношение", "Цель"]}
          rows={links.map((r) => [
            r.source_id === id ? (
              String(r.source_code)
            ) : (
              <Link to={"../requirements/" + r.source_id}>
                {String(r.source_code)}
              </Link>
            ),
            r.kind,
            r.target_id === id ? (
              String(r.target_code)
            ) : (
              <Link to={"../requirements/" + r.target_id}>
                {String(r.target_code)}
              </Link>
            ),
          ])}
        />
      </Panel>
      {current && (
        <Panel title="История согласований">
          <Grid
            responsive
            columns={["Редакция", "Ревьюер", "Решение", "Комментарий", "Дата"]}
            rows={reviews.map((r) => [
              "v" +
                (versions.find((version) => version.id === r.version_id)
                  ?.number ?? "—"),
              String(r.reviewer_name),
              <Badge value={String(r.decision)} />,
              String(r.comment),
              datetime(r.created_at),
            ])}
          />
        </Panel>
      )}
    </>
  );
}
export function GraphPage() {
  const { path, project } = useContext();
  const graph = useData<Graph>(path + "/graph");
  const [query] = useSearchParams();
  const origin = query.get("node") ?? undefined;
  const save = useWrite();
  const nodes = graph.data?.nodes ?? [];
  const codes = new Map(nodes.map((n) => [n.id, n.code]));
  const canEdit = project?.role !== "REVIEWER";
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  return (
    <>
      <Head
        title="Граф трассируемости"
        description="Направленные связи требований, архитектуры, данных и тестов"
      />
      <ErrorBox error={graph.error ?? save.error} />
      {graph.data ? (
        <Panel title="Зависимости">
          <Diagram
            key={origin}
            graph={graph.data}
            origin={origin}
            registry="../requirements/"
            impact="../impact"
          />
        </Panel>
      ) : (
        <Wait pending={graph.isPending} />
      )}
      {canEdit && (
        <Panel title="Добавить связь">
          <form
            className="pad toolbar"
            onSubmit={(e) => {
              const form = data(e);
              save.mutate({
                path: path + "/links",
                body: {
                  ...form,
                  source_version: form.source_version || null,
                  target_version: form.target_version || null,
                },
              });
            }}
          >
            <label>
              Из узла
              <select
                name="source_id"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                required
              >
                <option value="">Выберите</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              В узел
              <select
                name="target_id"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                required
              >
                <option value="">Выберите</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тип связи
              <select name="kind">
                {linkTypes.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            {[
              [source, "source_version", "Версия источника"],
              [target, "target_version", "Версия цели"],
            ].map(([id, key, label]) => (
              <Pin key={key + id} id={id} name={key} label={label} />
            ))}
            <button className="primary" disabled={save.isPending}>
              Добавить связь
            </button>
          </form>
        </Panel>
      )}
      <Panel title="Активные связи">
        <Grid
          columns={["Источник", "Тип", "Получатель", "Проверка", "Действие"]}
          rows={(graph.data?.links ?? []).map((edge) => [
            codes.get(edge.source_id),
            edge.kind,
            codes.get(edge.target_id),
            edge.stale ? "Устарела" : "Актуальна",
            canEdit && (
              <button
                disabled={save.isPending}
                onClick={() => {
                  if (confirm("Деактивировать связь?"))
                    save.mutate({
                      path: path + "/links/" + edge.id,
                      method: "DELETE",
                    });
                }}
              >
                Деактивировать
              </button>
            ),
          ])}
        />
      </Panel>
      {canEdit && (
        <Panel title="Добавить артефакт">
          <form
            className="pad form"
            onSubmit={(e) =>
              save.mutate({ path: path + "/artifacts", body: data(e) })
            }
          >
            <label>
              Код
              <input name="code" required />
            </label>
            <label>
              Тип
              <select name="kind">
                {artifactTypes.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Название
              <input name="title" required />
            </label>
            <label>
              Описание
              <textarea name="description" />
            </label>
            <label>
              Источник
              <input name="source" />
            </label>
            <label>
              Версия
              <input name="release" />
            </label>
            <button disabled={save.isPending}>Создать артефакт</button>
          </form>
        </Panel>
      )}
    </>
  );
}
function Pin({ id, name, label }: { id: string; name: string; label: string }) {
  const { path } = useContext();
  const node = useData<Details>(path + "/nodes/" + id, Boolean(id));
  return (
    <label>
      {label}
      <select name={name}>
        <option value="">Логическая связь</option>
        {node.data?.versions.map((v) => (
          <option value={v.id} key={v.id}>
            v{v.number}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Approvals() {
  const { path, user } = useContext();
  const list = useData<Row[]>(path + "/reviews");
  return (
    <>
      <Head
        title="Очередь согласований"
        description="Точные редакции и назначенные ревьюеры"
      />
      <ErrorBox error={list.error} />
      <Panel title="Ожидают решения">
        {list.isPending && <Wait pending />}
        {!list.isPending &&
          !list.error &&
          (list.data?.length ? (
            <Grid
              responsive
              columns={["Код", "Требование", "Версия", "Ревьюер", "Статус"]}
              rows={(list.data ?? []).map((i) => [
                i.code,
                <Link to={"../requirements/" + i.node_id + "?version=" + i.id}>
                  {i.title}
                </Link>,
                "v" + i.number,
                String(i.reviewer_name) +
                  (i.reviewer === user.id ? " · вы" : ""),
                <Badge value={i.status} />,
              ])}
            />
          ) : (
            <Wait empty="На согласовании нет редакций." />
          ))}
      </Panel>
    </>
  );
}
