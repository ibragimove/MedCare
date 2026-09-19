// Tumans of Xorazm viloyati. Always offered in pickers, even before any mahalla is
// stored for them, so a manager can add the missing mahallas in Hududlar.
export const XORAZM_TUMANS = [
  "Bogʻot",
  "Gurlan",
  "Xazorasp",
  "Xiva",
  "Xonqa",
  "Qoʻshkoʻpir",
  "Shovot",
  "Tuproqqalʼa",
  "Urganch",
  "Yangiariq",
  "Yangibozor",
];

export function sortUz(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, "uz"));
}
