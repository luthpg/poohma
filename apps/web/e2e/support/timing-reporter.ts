import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

interface StepTiming {
  title: string;
  durationMs: number;
}

interface TestTimingRecord {
  project: string;
  file: string;
  title: string;
  parallelIndex: number;
  status: string;
  retry: number;
  durationMs: number;
  steps: StepTiming[];
}

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(dirname, "../..");

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

export default class TimingReporter implements Reporter {
  private startTime = 0;
  private firstTestStartTime = 0;
  private configuredWorkers = 1;
  private records = new Map<string, TestTimingRecord>();

  onBegin(config: FullConfig, _suite: Suite): void {
    this.startTime = Date.now();
    this.configuredWorkers = config.workers;
  }

  onTestBegin(_test: TestCase, _result: TestResult): void {
    if (this.firstTestStartTime === 0) {
      this.firstTestStartTime = Date.now();
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name ?? "default";
    const relFile = path
      .relative(path.join(webDir, "e2e"), test.location.file)
      .replace(/\\/g, "/");
    const key = `${project}::${relFile}::${test.title}`;

    const steps: StepTiming[] = result.steps
      .filter((step) => step.category === "test.step")
      .map((step) => ({
        title: step.title,
        durationMs: step.duration,
      }));

    this.records.set(key, {
      project,
      file: relFile,
      title: test.title,
      parallelIndex: result.parallelIndex,
      status: result.status,
      retry: result.retry,
      durationMs: result.duration,
      steps,
    });
  }

  onEnd(result: FullResult): void {
    const now = Date.now();
    const totalWallTimeMs =
      result.duration > 0 ? result.duration : now - this.startTime;
    const testExecutionTimeMs =
      this.firstTestStartTime > 0
        ? now - this.firstTestStartTime
        : totalWallTimeMs;
    const entries = [...this.records.values()];
    const totalRetries = entries.reduce((sum, item) => sum + item.retry, 0);
    const passedCount = entries.filter(
      (item) => item.status === "passed",
    ).length;

    const summaryJson = {
      status: result.status,
      configuredWorkers: this.configuredWorkers,
      testExecutionTimeMs,
      totalWallTimeMs,
      totalTests: entries.length,
      passedTests: passedCount,
      totalRetries,
      tests: entries,
    };

    try {
      const outDir = path.join(webDir, "test-results");
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, "e2e-timings.json"),
        JSON.stringify(summaryJson, null, 2),
        "utf-8",
      );
    } catch {
      // レポート出力失敗でテスト実行自体を落とさない
    }

    const lines: string[] = [
      "",
      "### ⏱️ E2E Timing Summary",
      "",
      `- **Status**: ${result.status} (${passedCount}/${entries.length} passed, retries: ${totalRetries})`,
      `- **Test Execution Time**: ${formatSeconds(testExecutionTimeMs)} (Wall Time incl. WebServer: ${formatSeconds(totalWallTimeMs)}, workers: ${this.configuredWorkers})`,
      "",
      "| Project | Worker | File | Test | Retry | Duration |",
      "| :--- | :---: | :--- | :--- | :---: | ---: |",
    ];

    for (const item of entries) {
      lines.push(
        `| \`${item.project}\` | W${item.parallelIndex} | \`${item.file}\` | ${item.title} | ${item.retry} | ${formatSeconds(item.durationMs)} |`,
      );
      for (const step of item.steps) {
        lines.push(
          `| ↳ step | W${item.parallelIndex} | \`${item.file}\` | ${step.title} | - | ${formatSeconds(step.durationMs)} |`,
        );
      }
    }
    lines.push("");

    const markdown = lines.join("\n");
    console.log(markdown);

    const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (stepSummaryPath) {
      try {
        fs.appendFileSync(stepSummaryPath, `${markdown}\n`, "utf-8");
      } catch {
        // ignore
      }
    }
  }
}
