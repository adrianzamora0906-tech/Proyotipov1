import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const frontendPath = new URL(
  "../src/js/views/manager/ManagerReportsView.js",
  import.meta.url,
);
const backendPath = new URL(
  "../../backend/services/ReportService.js",
  import.meta.url,
);

test("los reportes muestran valores solo a Gerencia General", async () => {
  const [frontend, backend] = await Promise.all([
    readFile(frontendPath, "utf8"),
    readFile(backendPath, "utf8"),
  ]);

  assert.match(frontend, /this\.isGeneralManagerReport \|\| type !== "payments"/);
  assert.match(frontend, /this\.isGeneralManagerReport \|\| kind !== "money"/);
  assert.match(backend, /type === "payments"\) requireFinancialReportAccess\(auth\)/);
  assert.match(backend, /delete visibleSummary\.collected/);
  assert.match(backend, /rows\.map\(\(\{ amount, balance, \.\.\.row \}\) => row\)/);
  assert.match(backend, /definition\.columns\.filter\(\(\[, , kind\]\) => kind !== "money"\)/);
  assert.match(backend, /static async financial\(auth, filters = \{\}\) \{\s+requireFinancialReportAccess\(auth\)/);
});
