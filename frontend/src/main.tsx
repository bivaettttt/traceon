import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Link,
  Outlet,
  useOutletContext,
  useNavigate,
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
} from "lucide-react";
import {
  authenticate,
  call,
  useData,
  usePath,
  useWrite,
  type Row,
  type User,
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
      <div className="top">
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
      </div>
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
    <main className="landing">
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
            <input name="code" required pattern="[A-Z][A-Z0-9-]{1,29}" />
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
  ["", "Обзор", PanelTop],
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
function Workspace() {
  const { user } = useContext();
  const path = usePath();
  const project = useData<Row>(path);
  if (project.isPending) return <Wait pending />;
  if (project.error) return <ErrorBox error={project.error} />;
  const p = project.data!;
  return (
    <div className="shell">
      <aside>
        <Link className="project" to="/">
          <span>{p.code.slice(0, 2)}</span>
          <div>
            <strong>{p.name}</strong>
            <small>{p.code}</small>
          </div>
        </Link>
        <nav>
          {sections.map(([route, label, Icon]) => (
            <NavLink
              to={"/p/" + p.id + (route ? "/" + route : "")}
              end={!route}
              key={route}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <footer>{p.role}</footer>
      </aside>
      <main>
        <Outlet context={{ user, project: p, path } satisfies Context} />
      </main>
    </div>
  );
}
function Overview() {
  const { project, path } = useContext();
  const stats = useData<Record<string, number>>(path + "/stats");
  const items = useData<Row[]>(path + "/audit");
  return (
    <>
      <Head title={project!.name} description={project!.description}>
        <Link className="primary" to="requirements">
          Реестр требований <ArrowRight size={16} />
        </Link>
      </Head>
      <ErrorBox error={stats.error ?? items.error} />
      <div className="metrics">
        {[
          ["requirements", "Требования"],
          ["changes", "Открытые изменения"],
          ["pending_review", "На согласовании"],
          ["missing_tests", "Без тестов"],
          ["stale_requirements", "Устаревшие ссылки"],
        ].map(([key, label]) => (
          <div key={key}>
            <small>{label}</small>
            <strong>{stats.data?.[key] ?? "—"}</strong>
          </div>
        ))}
      </div>
      <Panel title="Последние действия">
        <AuditRows rows={items.data?.slice(0, 8) ?? []} />
      </Panel>
    </>
  );
}
function AuditRows({ rows }: { rows: Row[] }) {
  return (
    <Grid
      columns={["Действие", "Участник", "Объект", "Время"]}
      rows={rows.map((r) => [
        String(r.action),
        String(r.actor_name),
        <code>{short(r.object_id)}</code>,
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
        <AuditRows rows={records.data ?? []} />
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
