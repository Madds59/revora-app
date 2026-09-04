// Appointment server-action input schemas (mirrors the APPSEC-09 convention
// in lib/validation/jobs.js). Status transitions themselves are enforced by
// the SECURITY DEFINER RPCs in 0034_invoicing_and_appointments.sql -- these
// schemas only validate shape before a request reaches the database.

import { z } from "zod";
import { optionalText, optionalUuid, requiredText, uuid } from "./common.js";

const isoDatetime = (label) =>
  z
    .string({ message: `Please choose a valid ${label}.` })
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), `Please choose a valid ${label}.`);

/** requestAppointment (customer, portal): preferred window + optional notes.
 * customerId/businessId select which of the session's own linked accounts
 * the request is for -- the action still matches these against the
 * session-derived account list, never trusting them directly. */
export const requestAppointmentSchema = z
  .object({
    customerId: uuid("customer account"),
    businessId: uuid("business"),
    branchId: uuid("branch"),
    vehicleId: optionalUuid("vehicle"),
    requestedStart: isoDatetime("start time"),
    requestedEnd: isoDatetime("end time"),
    notes: optionalText(2000),
  })
  .refine((v) => new Date(v.requestedEnd) > new Date(v.requestedStart), {
    message: "The end time must be after the start time.",
    path: ["requestedEnd"],
  });

/** createAppointment (staff): same shape plus an explicit customer. */
export const createAppointmentSchema = z
  .object({
    customerId: uuid("customer"),
    branchId: uuid("branch"),
    vehicleId: optionalUuid("vehicle"),
    requestedStart: isoDatetime("start time"),
    requestedEnd: isoDatetime("end time"),
    notes: optionalText(2000),
  })
  .refine((v) => new Date(v.requestedEnd) > new Date(v.requestedStart), {
    message: "The end time must be after the start time.",
    path: ["requestedEnd"],
  });

/** confirmAppointment: id + the final assigned window. */
export const confirmAppointmentSchema = z
  .object({
    id: uuid("appointment"),
    confirmedStart: isoDatetime("start time"),
    confirmedEnd: isoDatetime("end time"),
  })
  .refine((v) => new Date(v.confirmedEnd) > new Date(v.confirmedStart), {
    message: "The end time must be after the start time.",
    path: ["confirmedEnd"],
  });

/** declineAppointment: id + a required reason. */
export const declineAppointmentSchema = z.object({
  id: uuid("appointment"),
  reason: requiredText("A reason", 1000),
});

/** cancelAppointment / convertAppointmentToQuotation: id only. */
export const appointmentIdSchema = z.object({
  id: uuid("appointment"),
});
