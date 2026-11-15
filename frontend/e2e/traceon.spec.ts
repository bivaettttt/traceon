import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 1000 } });

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
  await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible({
    timeout: 20_000,
  });
}
async function lab(page: Page, name: string) {
  await page.goto("/");
  await login(page, name);
  await page.getByRole("link", { name: "ServiceHub", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Рабочий стол трассируемости",
      exact: true,
    }),
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
  const transition = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/transition"),
  );
  await page.getByRole("button", { name: "Выполнить переход" }).click();
  expect((await transition).ok()).toBeTruthy();
}
test("create a project and requirement, store an artifact and link", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await login(page, "analyst");
  const code = "E2E-" + Date.now();
  await page.getByLabel("Код", { exact: true }).fill(code);
  await page
    .getByLabel("Название", { exact: true })
    .fill("Проверка нового проекта");
  await page.getByRole("button", { name: "Создать проект" }).click();
  await expect(
    page.getByRole("heading", { name: "Рабочий стол трассируемости" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByText("Проверка нового проекта", { exact: true }),
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
  test.setTimeout(160_000);
  await lab(page, "analyst");
  await expect(
    page.getByRole("heading", { name: "Выбранное требование" }),
  ).toBeVisible();
  await capture(page, "dashboard");
  await page.getByRole("link", { name: "Требования", exact: true }).click();
  await expect(page.getByText("FR-014", { exact: true })).toBeVisible();
  await capture(page, "registry");
  await page
    .getByRole("navigation", { name: "Разделы проекта" })
    .getByRole("link", { name: "Связи и граф", exact: true })
    .click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(10);
  await capture(page, "graph");
  await page.getByRole("link", { name: "Лаборатория", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Открыть FR-014" }),
  ).toBeVisible();
  await capture(page, "lab");
  await page.getByRole("link", { name: "Открыть FR-014" }).click();
  await page.getByRole("link", { name: "Создать запрос на изменение" }).click();
  await expect(
    page.getByLabel("Требование").locator("option:checked"),
  ).toHaveText(/FR-014/);
  await page
    .getByLabel("Название", { exact: true })
    .fill("Обязательное подтверждение руководителя");
  await page
    .getByLabel("Причина", { exact: true })
    .fill("Снизить риск ошибочного согласования чувствительных заявок.");
  await page
    .getByLabel("Предложение")
    .fill(
      "Проверять полномочия и подтверждение руководителя перед выполнением.",
    );
  await page.getByLabel("Риск").selectOption("HIGH");
  await page.getByRole("button", { name: "Создать запрос" }).click();
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
  const findings = page
    .getByRole("region", { name: "Затронутые элементы" })
    .getByRole("button");
  await expect(findings).toHaveCount(8);
  await findings.filter({ hasText: "TC-11" }).click();
  await expect(
    page.getByRole("heading", { name: "Объяснение · TC-11" }),
  ).toBeVisible();
  await capture(page, "impact");
  await findings.filter({ hasText: "FR-021" }).click();
  await expect(
    page.getByText("Обход против стрелки", { exact: true }),
  ).toBeVisible();
  const count = await findings.count();
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
  await expect(page.getByLabel("Согласованный запрос")).toHaveValue(changeId);
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
  await expect(
    page.getByRole("cell", { name: "FR-014", exact: true }),
  ).toBeVisible();
  await capture(page, "approval");
  await page
    .getByRole("link", { name: "Подтверждение сервисной заявки", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Решение", exact: true })
    .selectOption("APPROVED");
  await capture(page, "review");
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
  await expect(
    page
      .getByRole("list", { name: "Ход изменения" })
      .locator("[aria-current=step]"),
  ).toHaveText("Закрыт");
  await swap(page, "manager");
  await page
    .getByRole("link", { name: "Базовые конфигурации", exact: true })
    .click();
  const name = "ServiceHub 1.1 · подтверждение руководителя";
  await page.getByLabel("Название baseline").fill(name);
  await page.getByRole("button", { name: "Зафиксировать baseline" }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page
    .getByLabel("Снимок A · Было")
    .selectOption({ label: "ServiceHub 1.0" });
  await page.getByLabel("Снимок B · Стало").selectOption({ label: name });
  await expect(
    page.getByText("Добавлено: 0 · Удалено: 0 · Изменено: 1").first(),
  ).toBeVisible();
  await expect(
    page
      .locator(".diff-fields dd")
      .filter({ hasText: "Чувствительные заявки подтверждает руководитель." }),
  ).toBeVisible();
  await capture(page, "baseline");
});

test("mobile workspace renders user text literally", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await login(page, "analyst");
  const markup = "<b>ServiceHub fixture</b>";
  await page.getByLabel("Код", { exact: true }).fill("TEXT-" + Date.now());
  await page.getByLabel("Название", { exact: true }).fill(markup);
  await page.getByRole("button", { name: "Создать проект" }).click();
  await expect(
    page.getByRole("main").getByText(markup, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main").locator("b")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(390);
});

test("registry retains URL state and exports the complete scoped registry", async ({
  page,
}) => {
  await lab(page, "analyst");
  await page.getByRole("link", { name: "Требования", exact: true }).click();
  const csv = async () => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV всего реестра" }).click();
    const stream = await (await download).createReadStream();
    const parts = [];
    for await (const part of stream!) parts.push(part);
    return Buffer.concat(parts).toString("utf8");
  };
  const all = await csv();
  await page.getByLabel("Поиск", { exact: true }).fill("FR-014");
  await page.getByText("Уточнить выборку", { exact: true }).click();
  await page.getByLabel("Сортировка").selectOption("title");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "На странице: 1" }),
  ).toBeVisible();
  const filteredUrl = page.url();
  expect(filteredUrl).toContain("q=FR-014");
  expect(filteredUrl).toContain("sort=title");
  await page
    .getByRole("link", { name: "Подтверждение сервисной заявки", exact: true })
    .click();
  await page.getByRole("link", { name: "← Реестр требований" }).click();
  await expect(page).toHaveURL(filteredUrl);
  await expect(page.getByLabel("Поиск", { exact: true })).toHaveValue("FR-014");
  await expect(page.getByLabel("Сортировка")).toHaveValue("title");
  expect(all).toContain("FR-021");
  expect(all).toContain("FR-014");
  expect(await csv()).toBe(all);
});

test("graph activation, mobile workspace and reduced motion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 400)
      errors.push(response.status() + " " + response.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await lab(page, "analyst");
  const side = page.getByRole("navigation", { name: "Разделы проекта" });
  await side.getByRole("link", { name: "Связи и граф" }).click();
  const req = page.locator(".react-flow__node").filter({ hasText: "FR-014" });
  await req.focus();
  await req.press("Enter");
  await expect(req).toHaveClass(/selected/);
  const other = page.locator(".react-flow__node").filter({ hasText: "FR-021" });
  await other.focus();
  await other.press("Space");
  await expect(other).toHaveClass(/selected/);
  await req.click();
  await expect(req).toHaveClass(/selected/);
  await page.getByRole("link", { name: "Анализ влияния узла" }).click();
  await expect(
    page.getByLabel("Исходное требование").locator("option:checked"),
  ).toHaveText(/FR-014/);
  await expect(
    page.getByRole("button", { name: "Запустить анализ" }),
  ).toBeEnabled();
  await side.getByRole("link", { name: "Требования", exact: true }).click();
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("button", { name: "Разделы" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(side).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBe(width);
    if (width <= 390) {
      const row = page.getByRole("row").filter({ hasText: "FR-014" });
      await expect(row.getByText(/^v[0-9]+$/)).toBeVisible();
      await expect(row.getByText("Приоритет", { exact: true })).toBeVisible();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "mobile-workspace");
  await page.getByRole("button", { name: "Разделы" }).press("Enter");
  await expect(side).toBeVisible();
  await side.getByRole("link", { name: "Связи и граф" }).press("Enter");
  await expect(side).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Список связей" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Выбранный узел")).toBeVisible();
  expect(errors).toEqual([]);
});
