function joinParts(parts) {
  return parts
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter(Boolean)
    .join(" · ");
}

function formatVehicleLabel(vehicle, vehicleLabel, unknownVehicleLabel) {
  const makeModel = [vehicle?.make, vehicle?.model]
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter(Boolean)
    .join(" ");
  const plate = vehicle?.plate_number ?? vehicle?.plate ?? null;
  const year = vehicle?.year ?? null;

  if (makeModel) {
    return joinParts([makeModel, plate, year]);
  }

  const fallbackParts = [vehicleLabel, plate, year].filter(Boolean);
  if (fallbackParts.length > 1) {
    return joinParts(fallbackParts);
  }

  if (plate || year) {
    return joinParts([vehicleLabel, plate, year]);
  }

  if (vehicle?.vin) {
    const suffix = String(vehicle.vin).trim().slice(-6).toUpperCase();
    return joinParts([vehicleLabel, `VIN ending ${suffix || "XXXX"}`]);
  }

  return unknownVehicleLabel;
}

export { formatVehicleLabel };
