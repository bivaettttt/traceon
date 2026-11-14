import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
let token = "";
export function authenticate(value: string) {
  token = value;
}
export type Row = {
  id: string;
  code: string;
  name: string;
  title: string;
  description: string;
  kind: string;
  status: string;
  priority: string;
  number: number;
  version_id: string;
  latest_id: string;
  display_title: string;
  role: string;
  [key: string]: unknown;
};
export type Content = {
  title: string;
  description: string;
  rationale: string;
  priority: string;
  source: string;
  criteria: string;
  rules: string;
  reason: string;
};
export type Version = Content & {
  id: string;
  number: number;
  revision: number;
  status: string;
  author: string;
  reviewer: string;
  node_id: string;
  change_id: string | null;
};
export type Edge = {
  id: string;
  kind: string;
  source_id: string;
  target_id: string;
  stale: boolean;
};
export type Graph = { nodes: Row[]; links: Edge[] };
export type Step = {
  from: string;
  to: string;
  link_id: string;
  kind: string;
  stale: boolean;
};
export type Report = {
  id: string;
  epoch: number;
  stale: boolean;
  change_id: string | null;
  decisions: { node_id: string; decision: string; comment: string }[];
  snapshot: {
    graph: Graph;
    version: Version;
    missing_traceability: boolean;
    findings: {
      node_id: string;
      depth: number;
      stale: boolean;
      path: Step[];
    }[];
  };
};
export type User = {
  id: string;
  name: string;
  username: string;
  admin: boolean;
};
const errors: Record<string, string> = {
  INVALID_CREDENTIALS: "Проверьте логин и пароль.",
  DRAFT_CONFLICT: "Черновик изменился. Обновите страницу перед новой правкой.",
  ROLE_FORBIDDEN: "Недостаточно прав для действия.",
  CURRENT_ANALYSIS_REQUIRED: "Запустите актуальный анализ.",
  IMPACT_REVIEW_INCOMPLETE: "Примите решение по каждому элементу влияния.",
  INVALID_TRANSITION: "Переход недоступен в текущем состоянии.",
  STALE_ANALYSIS: "Граф изменился. Запустите новый анализ.",
  INCOMPLETE_REQUIREMENT: "Заполните описание, источник и критерии.",
  STRUCTURAL_CYCLE: "Эта связь замкнёт структурный цикл.",
  INVALID_INPUT: "Проверьте значения и формат полей.",
};
export async function call<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      errors[error.detail] ?? error.detail ?? `HTTP ${response.status}`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export function usePath() {
  return "/projects/" + useParams().project;
}
export function useData<T>(path: string, enabled = true) {
  return useQuery({
    queryKey: [path],
    queryFn: () => call<T>(path),
    enabled,
    retry: false,
  });
}
export function useWrite<T = Row>(onSuccess?: (value: T) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) => call<T>(path, method ?? "POST", body),
    onSuccess: (value) => {
      void qc.invalidateQueries();
      onSuccess?.(value);
    },
  });
}
export async function download(path: string, format: string) {
  const response = await fetch(
    "/api" + path + (path.includes("?") ? "&" : "?") + "format=" + format,
    { headers: { Authorization: "Bearer " + token } },
  );
  if (!response.ok) throw new Error("Не удалось сформировать отчёт.");
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download =
    response.headers
      .get("Content-Disposition")
      ?.match(/filename="([^"]+)"/)?.[1] ?? "traceon." + format;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
