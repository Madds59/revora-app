import test from "node:test";
import assert from "node:assert/strict";

import {
  buildForgotPasswordPath,
  buildLoginPath,
  buildResetPasswordPath,
  buildSignupPath,
} from "../src/lib/auth-links.js";

test("auth link helpers build locale-aware paths", () => {
  assert.equal(buildForgotPasswordPath("en"), "/en/forgot-password");
  assert.equal(buildForgotPasswordPath("ar"), "/ar/forgot-password");
  assert.equal(buildResetPasswordPath("en"), "/en/reset-password");
  assert.equal(buildResetPasswordPath("ar"), "/ar/reset-password");
  assert.equal(buildLoginPath("en"), "/en/login");
  assert.equal(buildLoginPath("ar"), "/ar/login");
  assert.equal(buildSignupPath("en"), "/en/signup");
  assert.equal(buildSignupPath("ar"), "/ar/signup");
});
