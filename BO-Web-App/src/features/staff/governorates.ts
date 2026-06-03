/**
 * Canonical 24-governorate list for Tunisia. Same ordering and spelling as
 * `CBS-Simulator/.../DataInitializer.java` so values picked here can match
 * existing CBS records exactly.
 */
export const TUNISIAN_GOVERNORATES = [
  "Tunis",
  "Ariana",
  "Ben Arous",
  "Manouba",
  "Nabeul",
  "Zaghouan",
  "Bizerte",
  "Beja",
  "Jendouba",
  "Le Kef",
  "Siliana",
  "Sousse",
  "Monastir",
  "Mahdia",
  "Sfax",
  "Kairouan",
  "Kasserine",
  "Sidi Bouzid",
  "Gabes",
  "Medenine",
  "Tataouine",
  "Gafsa",
  "Tozeur",
  "Kebili",
] as const;

export type TunisianGovernorate = (typeof TUNISIAN_GOVERNORATES)[number];
