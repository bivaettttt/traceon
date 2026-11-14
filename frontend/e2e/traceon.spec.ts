import { expect, test, type Page } from "@playwright/test";

const password = process.env.TRACEON_DEMO_PASSWORD ?? "Traceon-demo-local";
async function capture(page: Page, name: string) {
  if (!process.env.TRACEON_SCREENSHOTS) return;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: process.env.TRACEON_SCREENSHOTS + "/" + name + ".png",
    fullPage: true,
  });
}

async function login(page: Page, name: string) {
  await page.getByLabel("Логин", { exact: true }).fill(name);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
}
async function lab(page: Page, name: string) {
  await page.goto("/");
  await login(page, name);
  await page.getByRole("link", { name: "ServiceHub", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ServiceHub", exact: true }),
  ).toBeVisible();
}
async function swap(page: Page, name: string) {
  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, name);
}
async function transition(page: Page, status: string) {
  await page.getByLabel("Следующее состояние").selectOption(status);
  await page
    .getByLabel("Комментарий / доказательство")
    .fill("Проверено в браузере");
  await page.getByRole("button", { name: "Выполнить переход" }).click();
}
test("create a project and requirement, store an artifact and link", async ({
  page,
}) => {
  await page.goto("/");
  await login(page, "analyst");
  const code = "E2E-" + Date.now();
  await page.getByLabel("Код", { exact: true }).fill(code);
  await page
    .getByLabel("Название", { exact: true })
    .fill("Проверка нового проекта");
  await page.getByRole("button", { name: "Создать проект" }).click();
  await expect(
    page.getByRole("heading", { name: "Проверка нового проекта" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Требования", exact: true }).click();
  await page.getByRole("button", { name: "Новое требование" }).click();
  await page.getByLabel("Код", { exact: true }).fill("FR-E2E");
  await page
    .getByLabel("Заголовок", { exact: true })
    .fill("Требование из браузера");
  await page.getByRole("button", { name: "Создать требование" }).click();
  await expect(
    page.getByRole("heading", { name: "Требование из браузера" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Связи и граф" }).click();
  await page.getByLabel("Код", { exact: true }).fill("API-E2E");
  await page
    .getByRole("combobox", { name: "Тип", exact: true })
    .selectOption("ENDPOINT");
  await page
    .getByLabel("Название", { exact: true })
    .fill("Endpoint из браузера");
  await page.getByRole("button", { name: "Создать артефакт" }).click();
  await page.getByLabel("Из узла").selectOption({ label: "FR-E2E" });
  await page.getByLabel("В узел").selectOption({ label: "API-E2E" });
  await page.getByLabel("Тип связи").selectOption("IMPLEMENTED_BY");
  await page.getByRole("button", { name: "Добавить связь" }).click();
  await expect(
    page.getByRole("cell", { name: "IMPLEMENTED_BY", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
});
test("ServiceHub change proceeds from impact to approved revision and baseline diff", async ({
  page,
}) => {
  await lab(page, "analyst");
  await expect(
    page.getByRole("cell", { name: "BASELINE_CREATE" }),
  ).toBeVisible();
  await capture(page, "dashboard");
  await page.getByRole("link", { name: "Требования", exact: true }).click();
  await expect(page.getByText("FR-014", { exact: true })).toBeVisible();
  await capture(page, "registry");
  await page.getByRole("link", { name: "Связи и граф", exact: true }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(10);
  await capture(page, "graph");
  await page.getByRole("link", { name: "Лаборатория", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Создать учебный запрос" }),
  ).toBeVisible();
  await capture(page, "lab");
  await page.getByRole("button", { name: "Создать учебный запрос" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Обязательное подтверждение руководителя",
    }),
  ).toBeVisible();
  await capture(page, "change");
  const changeUrl = page.url();
  const changeId = changeUrl.split("/").at(-1)!;
  await transition(page, "UNDER_ANALYSIS");
  await page.getByLabel("Исходная версия").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Запустить анализ" }).click();
  await expect(
    page.getByRole("heading", { name: "Затронутые элементы" }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__edge").first()).toBeVisible();
  await capture(page, "impact");
  const findings = page.getByRole("table").first().getByRole("button");
  const count = await findings.count();
  expect(count).toBeGreaterThan(5);
  for (let i = 0; i < count; i++) {
    await findings.nth(i).click();
    await page.getByLabel("Комментарий", { exact: true }).fill("Путь проверен");
    const response = page.waitForResponse(
      (r) => r.url().includes("/decisions/") && r.ok(),
    );
    await page.getByRole("button", { name: "Сохранить оценку" }).click();
    await response;
  }
  await page.getByRole("link", { name: /Запрос на изменение/ }).click();
  await transition(page, "IMPACT_REVIEW");
  await expect(
    page.getByText("Проверка влияния", { exact: true }).first(),
  ).toBeVisible();
  await swap(page, "reviewer");
  await transition(page, "APPROVED");
  await expect(
    page.getByText("Утверждено", { exact: true }).first(),
  ).toBeVisible();
  await swap(page, "analyst");
  await page.getByRole("link", { name: "FR-014", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Содержание" })).toBeVisible();
  await capture(page, "requirement");
  const reqUrl = page.url();
  await page
    .getByLabel("Причина новой редакции")
    .fill("Шаг согласования руководителем");
  await page.getByLabel("ID согласованного запроса").fill(changeId);
  await page.getByRole("button", { name: "Создать редакцию" }).click();
  await page.getByRole("button", { name: "Редактировать черновик" }).click();
  await page
    .getByRole("textbox", { name: "Описание", exact: true })
    .fill("Чувствительные заявки подтверждает руководитель.");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(
    page.getByText("Чувствительные заявки подтверждает руководитель."),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Ревьюер", exact: true })
    .selectOption({ index: 1 });
  await page.getByRole("button", { name: "Отправить на согласование" }).click();
  await expect(
    page.getByText("На согласовании", { exact: true }).first(),
  ).toBeVisible();
  await swap(page, "reviewer");
  expect(page.url()).toBe(reqUrl);
  await page.getByRole("link", { name: "Согласования", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Очередь согласований" }),
  ).toBeVisible();
  await expect(page.getByText("FR-014", { exact: true })).toBeVisible();
  await capture(page, "approval");
  await page
    .getByRole("link", { name: "Подтверждение сервисной заявки", exact: true })
    .click();
  await page
    .getByLabel("Комментарий", { exact: true })
    .fill("Утверждаю конкретную редакцию");
  await page.getByRole("button", { name: "Сохранить решение" }).click();
  await expect(page.getByText("Утверждаю конкретную редакцию")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Исходная версия" })
    .selectOption({ label: "v1" });
  await page
    .getByRole("combobox", { name: "Новая версия" })
    .selectOption({ label: "v2" });
  await expect(
    page.getByRole("cell", {
      name: "Чувствительные заявки подтверждает руководитель.",
      exact: true,
    }),
  ).toBeVisible();
  await capture(page, "versions");
  await swap(page, "analyst");
  await page
    .getByRole("link", { name: "Запросы на изменение", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Обязательное подтверждение руководителя" })
    .first()
    .click();
  await transition(page, "IMPLEMENTED");
  await transition(page, "VERIFIED");
  await transition(page, "CLOSED");
  await expect(page.getByText("Закрыт", { exact: true })).toBeVisible();
  await swap(page, "manager");
  await page
    .getByRole("link", { name: "Базовые конфигурации", exact: true })
    .click();
  const name = "E2E baseline " + Date.now();
  await page.getByLabel("Название baseline").fill(name);
  await page.getByRole("button", { name: "Зафиксировать baseline" }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page
    .getByLabel("Исходная baseline")
    .selectOption({ label: "ServiceHub 1.0" });
  await page.getByLabel("Сравнить с").selectOption({ label: name });
  await expect(page.getByText(/requirements · \+0 · −0 · Δ1/)).toBeVisible();
  await capture(page, "baseline");
});
