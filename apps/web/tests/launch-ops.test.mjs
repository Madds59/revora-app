import test from "node:test";
import assert from "node:assert/strict";

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_STATUSES,
  IMPLEMENTATION_STAGES,
  getFeedbackCategoryLabel,
  getFeedbackPriorityLabel,
  getFeedbackSeverityLabel,
  getFeedbackStatusLabel,
  getImplementationStageLabel,
} from "../src/lib/launch-ops.js";
import {
  IMPORT_TEMPLATES,
  buildImportTemplateCsv,
  getImportTemplate,
} from "../src/lib/import-templates.js";

test("launch ops helpers expose localized feedback and implementation labels", () => {
  assert.deepEqual(FEEDBACK_CATEGORIES, [
    "feedback",
    "suggestion",
    "feature_request",
    "report_problem",
    "onboarding_help",
    "support_request",
  ]);
  assert.deepEqual(FEEDBACK_SEVERITIES, ["low", "normal", "high", "urgent"]);
  assert.deepEqual(FEEDBACK_STATUSES, [
    "new",
    "triaged",
    "planned",
    "in_progress",
    "resolved",
    "closed",
    "duplicate",
  ]);
  assert.deepEqual(FEEDBACK_PRIORITIES, ["low", "normal", "high", "urgent"]);
  assert.deepEqual(IMPLEMENTATION_STAGES, [
    "not_started",
    "discovery",
    "setup",
    "data_preparation",
    "pilot",
    "active",
    "blocked",
    "completed",
  ]);

  assert.equal(getFeedbackCategoryLabel("feature_request", "ar"), "طلب ميزة");
  assert.equal(getFeedbackSeverityLabel("urgent", "ar"), "عاجلة");
  assert.equal(getFeedbackStatusLabel("in_progress", "ar"), "قيد التنفيذ");
  assert.equal(getFeedbackPriorityLabel("normal", "ar"), "عادية");
  assert.equal(getImplementationStageLabel("data_preparation", "ar"), "تجهيز البيانات");
});

test("import templates expose stable CSV headers", () => {
  const branches = getImportTemplate("branches");
  assert.ok(branches);
  assert.equal(branches.fileName, "branches.csv");
  assert.deepEqual(branches.headers, [
    "branch_name",
    "phone",
    "email",
    "address",
    "city",
    "manager_email",
  ]);
  assert.equal(buildImportTemplateCsv("branches"), "branch_name,phone,email,address,city,manager_email\n");
  assert.equal(IMPORT_TEMPLATES.length, 6);
});
