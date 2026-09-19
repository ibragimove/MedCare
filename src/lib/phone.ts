// Uzbek phone helpers shared by the client mask and the API validation.

// "+998 90 123 45 67" style formatting while typing (also accepts pasted "901234567").
export function formatUzPhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("998")) digits = digits.slice(3);
  digits = digits.slice(0, 9);
  if (!digits && !input.trim()) return "";
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean);
  return `+998${parts.length ? " " + parts.join(" ") : ""}`;
}

// → "+998901234567", or null when the number is not a full Uzbek number.
export function normalizeUzPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("998")) digits = digits.slice(3);
  return digits.length === 9 ? `+998${digits}` : null;
}
