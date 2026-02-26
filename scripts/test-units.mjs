#!/usr/bin/env node
/**
 * Unit tests for pure functions in sprint-board.mjs and sprint-utils.mjs.
 * Uses Node built-ins only (node:assert + node:test).
 * Run: node scripts/test-units.mjs
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Import helpers from sprint-utils
// ---------------------------------------------------------------------------
import {
  nowIso,
  stripYamlValue,
  readSprintPathsFromConfig,
  parseArgv,
  requireOption
} from "./lib/sprint-utils.mjs";

// ---------------------------------------------------------------------------
// Import pure functions from sprint-board via a thin re-export shim.
// sprint-board.mjs has a try/catch main() at module scope that calls main()
// on import (process.argv-driven).  We work around this by importing only
// the functions we export via named re-exports in a shim, OR by testing
// behaviour via child_process for the CLI surface.
//
// For pure-function tests we replicate the logic under test directly here
// (keeping them in sync via acceptance assertions on the CLI output).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// sprint-utils: nowIso
// ---------------------------------------------------------------------------
test("nowIso returns a valid ISO-8601 string", () => {
  const iso = nowIso();
  assert.ok(typeof iso === "string", "should be a string");
  assert.ok(!Number.isNaN(Date.parse(iso)), "should be parseable as a date");
  assert.ok(iso.endsWith("Z"), "should be UTC (ends with Z)");
});

// ---------------------------------------------------------------------------
// sprint-utils: stripYamlValue
// ---------------------------------------------------------------------------
test("stripYamlValue removes surrounding double quotes", () => {
  assert.equal(stripYamlValue('"hello"'), "hello");
});

test("stripYamlValue removes surrounding single quotes", () => {
  assert.equal(stripYamlValue("'world'"), "world");
});

test("stripYamlValue trims surrounding whitespace", () => {
  assert.equal(stripYamlValue("  value  "), "value");
});

test("stripYamlValue leaves plain values untouched", () => {
  assert.equal(stripYamlValue("plain"), "plain");
});

test("stripYamlValue handles empty string", () => {
  assert.equal(stripYamlValue(""), "");
});

// ---------------------------------------------------------------------------
// sprint-utils: readSprintPathsFromConfig
// ---------------------------------------------------------------------------
function withTempFile(content, ext = ".yaml") {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "va-test-"));
  const filePath = path.join(tmpDir, `config${ext}`);
  fs.writeFileSync(filePath, content, "utf8");
  return { filePath, tmpDir };
}

test("readSprintPathsFromConfig returns {} for missing file", () => {
  const result = readSprintPathsFromConfig("/nonexistent/path/config.yaml");
  assert.deepEqual(result, {});
});

test("readSprintPathsFromConfig reads sprint section keys", () => {
  const yaml = `other:\n  key: ignored\nsprint:\n  stateFile: custom/state.json\n  boardFile: custom/board.md\n`;
  const { filePath } = withTempFile(yaml);
  const result = readSprintPathsFromConfig(filePath);
  assert.equal(result.stateFile, "custom/state.json");
  assert.equal(result.boardFile, "custom/board.md");
  assert.equal(result.other, undefined);
});

test("readSprintPathsFromConfig strips quotes from values", () => {
  const yaml = `sprint:\n  stateFile: "quoted/path.json"\n`;
  const { filePath } = withTempFile(yaml);
  const result = readSprintPathsFromConfig(filePath);
  assert.equal(result.stateFile, "quoted/path.json");
});

test("readSprintPathsFromConfig ignores comment lines", () => {
  const yaml = `sprint:\n  # this is a comment\n  stateFile: real.json\n`;
  const { filePath } = withTempFile(yaml);
  const result = readSprintPathsFromConfig(filePath);
  assert.equal(result.stateFile, "real.json");
});

test("readSprintPathsFromConfig ignores sections other than sprint", () => {
  const yaml = `database:\n  host: localhost\nsprint:\n  stateFile: s.json\n`;
  const { filePath } = withTempFile(yaml);
  const result = readSprintPathsFromConfig(filePath);
  assert.equal(result.stateFile, "s.json");
  assert.equal(result.host, undefined);
});

// ---------------------------------------------------------------------------
// sprint-utils: parseArgv
// ---------------------------------------------------------------------------
test("parseArgv: first non-flag token is command", () => {
  const { command, options } = parseArgv(["summary"]);
  assert.equal(command, "summary");
  assert.deepEqual(options, {});
});

test("parseArgv: --key value sets options", () => {
  const { options } = parseArgv(["cmd", "--id", "AP-001"]);
  assert.equal(options.id, "AP-001");
});

test("parseArgv: --key=value inline form", () => {
  const { options } = parseArgv(["cmd", "--state-file=custom/path.json"]);
  assert.equal(options["state-file"], "custom/path.json");
});

test("parseArgv: boolean flag --json goes into flags set", () => {
  const { flags } = parseArgv(["next", "--json"]);
  assert.ok(flags.has("json"));
});

test("parseArgv: missing value for non-bool flag throws", () => {
  assert.throws(
    () => parseArgv(["cmd", "--state-file"]),
    /Missing value for --state-file/
  );
});

test("parseArgv: boolean flag followed by non-flag token throws", () => {
  assert.throws(
    () => parseArgv(["cmd", "--json", "false"]),
    /boolean flag/
  );
});

test("parseArgv: leading --flag (no command token) sets empty command", () => {
  const { command, flags } = parseArgv(["--help"]);
  assert.equal(command, "");
  assert.ok(flags.has("help"));
});

test("parseArgv: custom bool flags recognised", () => {
  const { flags } = parseArgv(["cmd", "--reset-fail-count"], new Set(["json", "help", "reset-fail-count"]));
  assert.ok(flags.has("reset-fail-count"));
});

test("parseArgv: unknown key without value throws", () => {
  assert.throws(
    () => parseArgv(["cmd", "--title"]),
    /Missing value for --title/
  );
});

// ---------------------------------------------------------------------------
// sprint-utils: requireOption
// ---------------------------------------------------------------------------
test("requireOption returns value when present", () => {
  assert.equal(requireOption({ id: "AP-001" }, "id"), "AP-001");
});

test("requireOption throws when key is missing", () => {
  assert.throws(() => requireOption({}, "id"), /Missing required option --id/);
});

test("requireOption throws when value is empty string", () => {
  assert.throws(() => requireOption({ id: "" }, "id"), /Missing required option --id/);
});

// ---------------------------------------------------------------------------
// sprint-board pure functions — tested via CLI child process
// ---------------------------------------------------------------------------
import { spawnSync } from "node:child_process";

const BOARD_SCRIPT = new URL("../scripts/sprint-board.mjs", import.meta.url).pathname;
const STATE_TEMPLATE = {
  projectPrefix: "UT",
  updatedAt: "2026-01-01T00:00:00.000Z",
  tasks: []
};

function writeTmpState(tasks, prefix = "UT") {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "va-board-test-"));
  const stateFile = path.join(tmpDir, "sprint-state.json");
  fs.writeFileSync(
    stateFile,
    JSON.stringify({ ...STATE_TEMPLATE, projectPrefix: prefix, tasks }, null, 2),
    "utf8"
  );
  return { stateFile, tmpDir };
}

function runBoard(args, stateFile) {
  const allArgs = stateFile ? [...args, "--state-file", stateFile] : args;
  return spawnSync("node", [BOARD_SCRIPT, ...allArgs], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env }
  });
}

// ---------------------------------------------------------------------------
// normalizeTask / schema — tested by round-tripping add command
// ---------------------------------------------------------------------------
test("add: creates task with sequential ID and Backlog state", () => {
  const { stateFile } = writeTmpState([]);
  const r = runBoard(["add", "--title", "First task", "--priority", "P1"], stateFile);
  assert.equal(r.status, 0, `add failed: ${r.stderr}`);
  assert.ok(r.stdout.includes("UT-001"), `expected UT-001 in: ${r.stdout}`);

  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const task = state.tasks[0];
  assert.equal(task.id, "UT-001");
  assert.equal(task.state, "Backlog");
  assert.equal(task.priority, "P1");
});

test("add: second task gets UT-002", () => {
  const { stateFile } = writeTmpState([
    { id: "UT-001", title: "First", priority: "P1", state: "Backlog" }
  ]);
  const r = runBoard(["add", "--title", "Second", "--priority", "P2"], stateFile);
  assert.equal(r.status, 0, `add failed: ${r.stderr}`);
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(state.tasks[1].id, "UT-002");
});

test("add: rejects unknown priority", () => {
  const { stateFile } = writeTmpState([]);
  const r = runBoard(["add", "--title", "Bad", "--priority", "PX"], stateFile);
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("Invalid priority") || r.stdout.includes("Invalid priority"));
});

// ---------------------------------------------------------------------------
// sortTasks / findNextTask — via next command
// ---------------------------------------------------------------------------
test("next: returns highest priority backlog task first", () => {
  const { stateFile } = writeTmpState([
    { id: "UT-001", title: "P2 task", priority: "P2", state: "Backlog", dependsOn: [] },
    { id: "UT-002", title: "P1 task", priority: "P1", state: "Backlog", dependsOn: [] }
  ]);
  const r = runBoard(["next"], stateFile);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("UT-002"), `expected UT-002 first, got: ${r.stdout}`);
});

test("next: Failed tasks come before Backlog tasks", () => {
  const { stateFile } = writeTmpState([
    { id: "UT-001", title: "Failed", priority: "P1", state: "Failed", dependsOn: [] },
    { id: "UT-002", title: "Backlog", priority: "P0", state: "Backlog", dependsOn: [] }
  ]);
  const r = runBoard(["next"], stateFile);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("UT-001"), `expected Failed task UT-001, got: ${r.stdout}`);
});

test("next: dependency-blocked task is skipped", () => {
  const { stateFile } = writeTmpState([
    { id: "UT-001", title: "Blocker", priority: "P1", state: "Backlog", dependsOn: ["UT-999"] },
    { id: "UT-002", title: "Free", priority: "P2", state: "Backlog", dependsOn: [] }
  ]);
  const r = runBoard(["next"], stateFile);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("UT-002"), `expected unblocked UT-002, got: ${r.stdout}`);
});

test("next: empty backlog returns no actionable task", () => {
  const { stateFile } = writeTmpState([]);
  const r = runBoard(["next"], stateFile);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("No actionable task found"), r.stdout);
});

// ---------------------------------------------------------------------------
// detectCycles — via plan command (cycle detection throws before plan is built)
// ---------------------------------------------------------------------------
test("plan: detects dependency cycles and exits non-zero", () => {
  const { stateFile } = writeTmpState([
    { id: "UT-001", title: "A", priority: "P1", state: "Backlog", dependsOn: ["UT-002"] },
    { id: "UT-002", title: "B", priority: "P1", state: "Backlog", dependsOn: ["UT-001"] }
  ]);
  const r = runBoard(["plan", "--json"], stateFile);
  assert.notEqual(r.status, 0, "expected non-zero exit for cycle");
  assert.ok(
    r.stderr.includes("cycle") || r.stdout.includes("cycle"),
    `expected cycle error, got stderr: ${r.stderr} stdout: ${r.stdout}`
  );
});

// ---------------------------------------------------------------------------
// escapeCell / renderBoardMarkdown — via render command
// ---------------------------------------------------------------------------
test("render: produces valid markdown file", () => {
  const { stateFile, tmpDir } = writeTmpState([
    { id: "UT-001", title: "Task with | pipe", priority: "P1", state: "Backlog", dependsOn: [] }
  ]);
  const boardFile = path.join(tmpDir, "sprint.md");
  const r = runBoard(["render", "--board-file", boardFile], stateFile);
  assert.equal(r.status, 0, r.stderr);
  const md = fs.readFileSync(boardFile, "utf8");
  assert.ok(md.includes("# Sprint Board"), "missing heading");
  // pipe in task title must be escaped
  assert.ok(md.includes("\\|"), "pipe character must be escaped");
});

// ---------------------------------------------------------------------------
// update: state transitions and timestamp side-effects
// ---------------------------------------------------------------------------
test("update: sets state to In Progress and records startedAt", () => {
  const { stateFile } = writeTmpState([
    { id: "UT-001", title: "Task", priority: "P1", state: "Backlog", startedAt: "", dependsOn: [] }
  ]);
  const r = runBoard(["update", "--id", "UT-001", "--state", "In Progress"], stateFile);
  assert.equal(r.status, 0, r.stderr);
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(state.tasks[0].state, "In Progress");
  assert.ok(state.tasks[0].startedAt, "startedAt should be set");
});

test("update: state Failed increments failCount", () => {
  const { stateFile } = writeTmpState([
    { id: "UT-001", title: "Task", priority: "P1", state: "In Progress", failCount: 0, dependsOn: [] }
  ]);
  runBoard(["update", "--id", "UT-001", "--state", "Failed"], stateFile);
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(state.tasks[0].failCount, 1);
  assert.ok(state.tasks[0].lastFailedAt, "lastFailedAt should be set");
});

test("update: state Done sets completedAt", () => {
  const { stateFile } = writeTmpState([
    { id: "UT-001", title: "Task", priority: "P1", state: "Testing", completedAt: "", dependsOn: [] }
  ]);
  runBoard(["update", "--id", "UT-001", "--state", "Done"], stateFile);
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.ok(state.tasks[0].completedAt, "completedAt should be set");
});

test("update: rejects invalid state", () => {
  const { stateFile } = writeTmpState([
    { id: "UT-001", title: "Task", priority: "P1", state: "Backlog", dependsOn: [] }
  ]);
  const r = runBoard(["update", "--id", "UT-001", "--state", "Limbo"], stateFile);
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("Invalid state"), r.stderr);
});

test("update: unknown task ID throws", () => {
  const { stateFile } = writeTmpState([]);
  const r = runBoard(["update", "--id", "UT-999", "--state", "Done"], stateFile);
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("Task not found"), r.stderr);
});

// ---------------------------------------------------------------------------
// journal: append-only entries
// ---------------------------------------------------------------------------
test("journal: appends entry to existing file", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "va-journal-test-"));
  const journalFile = path.join(tmpDir, "run-journal.md");
  fs.writeFileSync(journalFile, "# Run Journal\n\n## Entries\n", "utf8");

  const r = spawnSync(
    "node",
    [BOARD_SCRIPT, "journal", "--task", "UT-001", "--summary", "Test entry", "--journal-file", journalFile],
    { encoding: "utf8", timeout: 10_000 }
  );
  assert.equal(r.status, 0, r.stderr);

  const content = fs.readFileSync(journalFile, "utf8");
  assert.ok(content.includes("UT-001"), "journal must include task ID");
  assert.ok(content.includes("Test entry"), "journal must include summary");
});

test("journal: creates file if it does not exist", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "va-journal-new-"));
  const journalFile = path.join(tmpDir, "new-journal.md");

  const r = spawnSync(
    "node",
    [BOARD_SCRIPT, "journal", "--task", "UT-002", "--summary", "New file entry", "--journal-file", journalFile],
    { encoding: "utf8", timeout: 10_000 }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(journalFile), "journal file should have been created");
  const content = fs.readFileSync(journalFile, "utf8");
  assert.ok(content.includes("UT-002"), content);
});

// ---------------------------------------------------------------------------
// normalizeDependsOn / --depends-on option
// ---------------------------------------------------------------------------
test("add: --depends-on stores comma-separated IDs", () => {
  const { stateFile } = writeTmpState([
    { id: "UT-001", title: "Dep", priority: "P1", state: "Done", dependsOn: [] }
  ]);
  const r = runBoard(
    ["add", "--title", "Dependent task", "--priority", "P2", "--depends-on", "UT-001"],
    stateFile
  );
  assert.equal(r.status, 0, r.stderr);
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const task = state.tasks.find((t) => t.title === "Dependent task");
  assert.deepEqual(task.dependsOn, ["UT-001"]);
});

// ---------------------------------------------------------------------------
// summary: correct counts
// ---------------------------------------------------------------------------
test("summary: counts tasks by state", () => {
  const { stateFile } = writeTmpState([
    { id: "UT-001", title: "B1", priority: "P1", state: "Backlog", dependsOn: [] },
    { id: "UT-002", title: "B2", priority: "P2", state: "Backlog", dependsOn: [] },
    { id: "UT-003", title: "IP", priority: "P1", state: "In Progress", dependsOn: [] },
    { id: "UT-004", title: "D1", priority: "P1", state: "Done", dependsOn: [] }
  ]);
  const r = runBoard(["summary"], stateFile);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("Backlog    : 2"), r.stdout);
  assert.ok(r.stdout.includes("In Progress: 1"), r.stdout);
  assert.ok(r.stdout.includes("Done       : 1"), r.stdout);
});
