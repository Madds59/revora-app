import { switchLocalePath } from "./locale-path.js";

export function buildForgotPasswordPath(locale) {
  return switchLocalePath("/forgot-password", locale);
}

export function buildResetPasswordPath(locale) {
  return switchLocalePath("/reset-password", locale);
}

export function buildLoginPath(locale) {
  return switchLocalePath("/login", locale);
}

export function buildSignupPath(locale) {
  return switchLocalePath("/signup", locale);
}
