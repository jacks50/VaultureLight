import { randomChars, shuffle } from "./random";

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = LOWERCASE.toUpperCase();
const DIGITS = "0123456789";
// Same symbol set as VaultuReact
const SYMBOLS = "+*%&=-!?$/.(){}";

export const LIMITS = {
  letters: { min: 12, max: 36, initial: 12 },
  digits: { min: 4, max: 12, initial: 4 },
  symbols: { min: 4, max: 12, initial: 4 },
} as const;

/** `letters` lowercase/uppercase letters (split evenly), plus `digits` digits and `symbols` symbols, shuffled. */
export function generatePassword(letters: number, digits: number, symbols: number): string {
  const chars =
    randomChars(LOWERCASE, Math.ceil(letters / 2)) +
    randomChars(UPPERCASE, Math.floor(letters / 2)) +
    randomChars(DIGITS, digits) +
    randomChars(SYMBOLS, symbols);
  return shuffle([...chars]).join("");
}
