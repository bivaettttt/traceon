import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles.css";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Link,
  Outlet,
  useNavigate,
  useLocation,
  useSearchParams,
  Navigate,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Layers3,
  PanelTop,
  FolderKanban,
  ListChecks,
  GitFork,
  Grid2X2,
  GitPullRequest,
  CheckCheck,
  Waypoints,
  History,
  FileDown,
  Settings,
  LogOut,
  FlaskConical,
  ArrowRight,
  Menu,
  ChevronDown,
} from "lucide-react";
import {
  authenticate,
  call,
  useData,
  usePath,
  useWrite,
  type Row,
  type User,
  type Version,
} from "./api";
import {
  data,
  ErrorBox,
  Grid,
  Head,
  Panel,
  Wait,
  datetime,
  Export,
  Badge,
  short,
  priorities,
} from "./ui";
import { Registry, Requirement, GraphPage, Approvals } from "./requirements";
import {
  Changes,
  Change,
  Impact,
  ImpactList,
  Baselines,
  Quality,
  Lab,
} from "./workflows";

const cache = new QueryClient();
import { useContext, type Context } from "./context";
function Brand() {
  return (
    <div className="brand">
      <span>
        <Layers3 size={21} />
      </span>
      Traceon
    </div>
  );
}
function Login({ ready }: { ready: (user: User) => void }) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <section>
        <Brand />
        <h1>Вход в Traceon</h1>
        <p>Рабочее пространство системного аналитика</p>
        <form
          onSubmit={(e) => {
            const body = data(e);
            setBusy(true);
            setError(null);
            void call<{ token: string }>("/login", "POST", body)
              .then(async (r) => {
                authenticate(r.token);
                ready(await call<User>("/me"));
              })
              .catch(setError)
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Логин
            <input name="username" required autoComplete="username" />
          </label>
          <label>
            Пароль
            <input
              name="password"
              required
              type="password"
              autoComplete="current-password"
            />
          </label>
          <ErrorBox error={error} />
          <button className="primary" disabled={busy}>
            Войти <ArrowRight size={16} />
          </button>
        </form>
      </section>
    </div>
  );
}
function Root() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<unknown>(null);
  if (!user) return <Login ready={setUser} />;
  return (
    <>
      <a className="skip" href="#main-content">
        К содержимому
      </a>
      <header className="top">
        <Link to="/">
          <Brand />
        </Link>
        <span className="topline">Рабочее пространство</span>
        <div className="actions">
          <span>{user.name}</span>
          <button
            title="Выйти"
            aria-label="Выйти"
            onClick={() =>
              void call("/logout", "POST")
                .then(() => {
                  authenticate("");
                  cache.clear();
                  setUser(null);
                })
                .catch(setError)
            }
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <ErrorBox error={error} />
      <Outlet context={{ user, path: "" } satisfies Context} />
    </>
  );
}
function Projects() {
  const { user } = useContext();
  const results = useData<Row[]>("/projects");
  const navigate = useNavigate();
  const save = useWrite<Row>((value) => navigate("/p/" + value.id));
  return (
    <main className="landing" id="main-content" tabIndex={-1}>
      <Head
        title="Проекты"
        description="Требования, изменения и базовые конфигурации"
      />
      <ErrorBox error={results.error ?? save.error} />
      <Panel title="Доступные проекты">
        {results.isPending ? (
          <Wait pending />
        ) : (
          <Grid
            columns={["Код", "Проект", "Роль", "Состояние"]}
            rows={(results.data ?? []).map((p) => [
              p.code,
              <Link to={"/p/" + p.id}>{p.name}</Link>,
              p.role,
              p.archived ? "Архив" : "Активен",
            ])}
          />
        )}
      </Panel>
      <Panel title="Создать проект">
        <form
          className="pad form"
          onSubmit={(e) => save.mutate({ path: "/projects", body: data(e) })}
        >
          <label>
            Код
            <input
              name="code"
              required
              pattern={String.raw`[A-Z][A-Z0-9\-]{1,29}`}
            />
          </label>
          <label>
            Название
            <input name="name" required />
          </label>
          <label>
            Описание
            <textarea name="description" />
          </label>
          <button className="primary" disabled={save.isPending}>
            Создать проект
          </button>
        </form>
      </Panel>
      {user.admin && <Admin />}
    </main>
  );
}
function Admin() {
  const members = useData<User[]>("/users");
  const save = useWrite();
  return (
    <Panel title="Учебные пользователи">
      <Grid
        columns={["Логин", "Имя", "ID"]}
        rows={(members.data ?? []).map((u) => [
          u.username,
          u.name,
          <code>{u.id}</code>,
        ])}
      />
      <ErrorBox error={save.error ?? members.error} />
      <form
        className="pad toolbar"
        onSubmit={(e) => save.mutate({ path: "/users", body: data(e) })}
      >
        <label>
          Логин
          <input name="username" required />
        </label>
        <label>
          Имя
          <input name="name" required />
        </label>
        <label>
          Пароль
          <input name="password" type="password" minLength={12} required />
        </label>
        <button disabled={save.isPending}>Добавить пользователя</button>
      </form>
    </Panel>
  );
}
const sections = [
  ["", "Рабочий стол", PanelTop],
  ["requirements", "Требования", ListChecks],
  ["graph", "Связи и граф", GitFork],
  ["quality", "Матрица и качество", Grid2X2],
  ["changes", "Запросы на изменение", GitPullRequest],
  ["impact", "Анализ влияния", Waypoints],
  ["approvals", "Согласования", CheckCheck],
  ["baselines", "Базовые конфигурации", FolderKanban],
  ["audit", "Аудит", History],
  ["reports", "Отчёты", FileDown],
  ["settings", "Настройки", Settings],
  ["lab", "Лаборатория", FlaskConical],
] as const;
const navGroups = [
  { label: "", sections: sections.slice(0, 1) },
  { label: "Требования", sections: sections.slice(1, 4) },
  { label: "Изменения", sections: sections.slice(4, 7) },
  { label: "Проект", sections: sections.slice(7) },
];

function Workspace() {
  const { user } = useContext();
  const path = usePath();
  const location = useLocation();
  const [menu, setMenu] = useState<string | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const project = useData<Row>(path);
  if (project.isPending) return <Wait pending />;
  if (project.error) return <ErrorBox error={project.error} />;
  const p = project.data!;
  const open = menu === location.pathname;
  const root = "/p/" + p.id;
  return (
    <div className="shell">
      <div className="mobile-project">
        <Link to="/" aria-label={p.name + " · Все проекты"}>
          {p.name}
        </Link>
        <button
          type="button"
          aria-expanded={open}
          ref={menuButton}
          aria-controls="workspace-nav"
          onClick={() => setMenu(open ? null : location.pathname)}
        >
          <Menu size={18} aria-hidden="true" /> Разделы
        </button>
      </div>
      <aside
        id="workspace-nav"
        className={open ? "is-open" : ""}
        aria-label="Рабочее пространство"
        onKeyDown={(event) => {
          if (open && event.key === "Escape") {
            setMenu(null);
            menuButton.current?.focus();
          }
        }}
      >
        <Link className="project" to="/" aria-label={p.name + " · Все проекты"}>
          <span aria-hidden="true">{p.code.slice(0, 2)}</span>
          <div>
            <strong>{p.name}</strong>
            <small>Все проекты</small>
          </div>
          <ChevronDown size={14} aria-hidden="true" />
        </Link>
        <nav aria-label="Разделы проекта">
          {navGroups.map(({ label, sections }) => (
            <div className="nav-group" key={label}>
              {label && <p>{label}</p>}
              {sections.map(([route, name, Icon]) => (
                <NavLink
                  to={root + (route ? "/" + route : "")}
                  end={!route}
                  key={route}
                  onClick={() => {
                    if (open) {
                      setMenu(null);
                      requestAnimationFrame(() => main.current?.focus());
                    }
                  }}
                >
                  <Icon size={16} aria-hidden="true" />
                  {name}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <footer>
          <Badge value={p.role} />
        </footer>
      </aside>
      <main id="main-content" tabIndex={-1} ref={main}>
        <Outlet context={{ user, project: p, path }} />
      </main>
    </div>
  );
}

function Overview() {
  const { project, path } = useContext();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const stats = useData<Record<string, number>>(path + "/stats");
  const items = useData<Row[]>(path + "/requirements");
  const search = query.trim().toLowerCase();
  const records = (items.data ?? []).filter((item) =>
    (item.code + " " + item.title).toLowerCase().includes(search),
  );
  const choice =
    records.find((item) => item.id === params.get("focus")) ??
    records.find((item) => item.kind === "FUNCTIONAL") ??
    records[0];
  const detail = useData<{ versions: Version[]; links: Row[] }>(
    path + "/nodes/" + choice?.id,
    Boolean(choice),
  );
  const version = detail.data?.versions[0];
  return (
    <>
      <Head
        title="Рабочий стол трассируемости"
        description={
          project!.name +
          (project!.description ? " · " + project!.description : "")
        }
      />
      <ErrorBox error={stats.error ?? items.error ?? detail.error} />
      <div className="overview-layout">
        <Panel title="Требования проекта">
          <div className="pad">
            <label>
              Поиск в списке
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Код или название"
              />
            </label>
            <Link
              className="secondary-link"
              to={
                "requirements" +
                (query ? "?" + new URLSearchParams({ q: query }) : "")
              }
            >
              Полный реестр <ArrowRight size={15} />
            </Link>
          </div>
          {items.isPending ? (
            <Wait pending />
          ) : (
            <ul className="record-list">
              {records.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={choice?.id === item.id}
                    onClick={() => setParams({ focus: item.id })}
                  >
                    <code>{item.code}</code>
                    <strong>{item.title}</strong>
                  </button>
                </li>
              ))}
              {!records.length && (
                <li>
                  <Wait empty="На текущей странице реестра совпадений нет." />
                </li>
              )}
            </ul>
          )}
        </Panel>
        {choice ? (
          <Panel title="Выбранное требование">
            <div className="pad stack focus-record">
              <div className="record-meta">
                <code>
                  {choice.code} · v{choice.number}
                </code>
                <Badge value={choice.status} />
                <span className="badge">
                  {priorities[choice.priority] ?? choice.priority}
                </span>
              </div>
              <h3>{choice.title}</h3>
              {detail.isPending ? (
                <p className="muted" role="status">
                  Загрузка редакции…
                </p>
              ) : (
                <p className="bodytext">
                  {version?.description || "Описание пока отсутствует."}
                </p>
              )}
              <Link className="primary" to={"requirements/" + choice.id}>
                Открыть требование <ArrowRight size={16} />
              </Link>
            </div>
            <ul className="task-list">
              <li>
                <Link to={"graph?node=" + choice.id}>Связи и граф</Link>
                <p>{detail.data?.links.length ?? "—"} активных связей</p>
              </li>
              <li>
                <Link
                  to={
                    "impact?version=" + choice.version_id + "&node=" + choice.id
                  }
                >
                  Проверить влияние версии v{choice.number}
                </Link>
              </li>
            </ul>
          </Panel>
        ) : null}
        <Panel title="Работа по проекту">
          <ul className="task-list">
            <li>
              <Link to="quality">Покрытие тестами</Link>
              <p>
                {stats.data?.missing_tests ?? "—"} утверждённых требований без
                теста
              </p>
            </li>
            <li>
              <Link to="changes">Запросы на изменение</Link>
              <p>{stats.data?.changes ?? "—"} открытых запросов</p>
            </li>
            <li>
              <Link to="approvals">Очередь согласований</Link>
              <p>
                {stats.data?.pending_review ?? "—"} редакций на согласовании
              </p>
            </li>
            <li>
              <Link to="baselines">Сравнить базовые конфигурации</Link>
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
const auditLabels: Record<string, string> = {
  LINK_CREATE: "Добавлена связь",
  LINK_DEACTIVATE: "Связь деактивирована",
  BASELINE_CREATE: "Снимок зафиксирован",
  CHANGE_CREATE: "Изменение зарегистрировано",
  REQUIREMENT_CREATE: "Создано требование",
  IMPACT_DECISION: "Сохранена оценка влияния",
};
function AuditRows({ rows }: { rows: Row[] }) {
  return (
    <Grid
      columns={["Действие", "Участник", "Объект", "Время"]}
      rows={rows.map((r) => [
        auditLabels[String(r.action)] ?? String(r.action),
        String(r.actor_name),
        <code title={String(r.object_id ?? "")}>{short(r.object_id)}</code>,
        datetime(r.created_at),
      ])}
    />
  );
}
function Audit() {
  const { path } = useContext();
  const [offset, setOffset] = useState(0);
  const records = useData<Row[]>(path + "/audit?offset=" + offset);
  return (
    <>
      <Head
        title="История действий"
        description="События рабочего пространства, привязанные к субъектам и объектам"
      />
      <ErrorBox error={records.error} />
      <Panel title="Аудит">
        {records.isPending ? (
          <Wait pending />
        ) : (
          <AuditRows rows={records.data ?? []} />
        )}
        <div className="pad actions">
          <button disabled={!offset} onClick={() => setOffset(offset - 100)}>
            Назад
          </button>
          <button
            disabled={(records.data?.length ?? 0) < 100}
            onClick={() => setOffset(offset + 100)}
          >
            Далее
          </button>
        </div>
      </Panel>
    </>
  );
}
function SettingsPage() {
  const { project, path } = useContext();
  const members = useData<Row[]>(path + "/members");
  const save = useWrite();
  const manager = project?.role === "PROJECT_MANAGER";
  return (
    <>
      <Head title="Настройки проекта" />
      <ErrorBox error={save.error ?? members.error} />
      <Panel title="Метаданные">
        <form
          className="pad form"
          onSubmit={(e) => {
            const v = data(e);
            save.mutate({
              path,
              method: "PATCH",
              body: {
                name: v.name,
                description: v.description,
                archived: v.archived === "yes",
              },
            });
          }}
        >
          <label>
            Название
            <input
              name="name"
              defaultValue={project?.name}
              required
              disabled={!manager}
            />
          </label>
          <label>
            Описание
            <textarea
              name="description"
              defaultValue={project?.description}
              disabled={!manager}
            />
          </label>
          <label>
            Состояние
            <select
              name="archived"
              defaultValue={project?.archived ? "yes" : "no"}
              disabled={!manager}
            >
              <option value="no">Активен</option>
              <option value="yes">Архив</option>
            </select>
          </label>
          {manager && (
            <button className="primary" disabled={save.isPending}>
              Сохранить
            </button>
          )}
        </form>
      </Panel>
      <Panel title="Участники">
        <Grid
          columns={["Участник", "Роль", "ID"]}
          rows={(members.data ?? []).map((m) => [
            m.name,
            <Badge value={m.role} />,
            <code>{m.id}</code>,
          ])}
        />
        {manager && (
          <form
            className="toolbar pad"
            onSubmit={(e) =>
              save.mutate({
                path: path + "/members",
                method: "PUT",
                body: data(e),
              })
            }
          >
            <label>
              ID пользователя
              <input name="actor" required />
            </label>
            <label>
              Роль
              <select name="role">
                <option>ANALYST</option>
                <option>REVIEWER</option>
                <option>PROJECT_MANAGER</option>
              </select>
            </label>
            <button disabled={save.isPending}>Назначить</button>
          </form>
        )}
      </Panel>
    </>
  );
}
function Reports() {
  const { path } = useContext();
  const [kind, setKind] = useState("registry");
  const [id, setId] = useState("");
  const [right, setRight] = useState("");
  return (
    <>
      <Head title="Отчёты и экспорт" />
      <Panel title="Состав отчёта">
        <div className="pad toolbar">
          <label>
            Отчёт
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {[
                "registry",
                "matrix",
                "coverage",
                "change",
                "impact",
                "baseline",
                "baseline-comparison",
              ].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          {!["registry", "matrix", "coverage"].includes(kind) && (
            <label>
              ID объекта
              <input value={id} onChange={(e) => setId(e.target.value)} />
            </label>
          )}
          {kind === "baseline-comparison" && (
            <label>
              ID правой baseline
              <input value={right} onChange={(e) => setRight(e.target.value)} />
            </label>
          )}
          <Export
            path={
              path +
              "/export/" +
              kind +
              "?" +
              new URLSearchParams({
                ...(id ? { identifier: id } : {}),
                ...(right ? { right } : {}),
              })
            }
          />
        </div>
      </Panel>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={cache}>
    <BrowserRouter>
      <Routes>
        <Route element={<Root />}>
          <Route index element={<Projects />} />
          <Route path="p/:project" element={<Workspace />}>
            <Route index element={<Overview />} />
            <Route path="requirements" element={<Registry />} />
            <Route path="requirements/:id" element={<Requirement />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="quality" element={<Quality />} />
            <Route path="changes" element={<Changes />} />
            <Route path="changes/:id" element={<Change />} />
            <Route path="impact" element={<ImpactList />} />
            <Route path="impact/:id" element={<Impact />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="baselines" element={<Baselines />} />
            <Route path="audit" element={<Audit />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="reports" element={<Reports />} />
            <Route path="lab" element={<Lab />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>,
);
