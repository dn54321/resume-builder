/**
 * Encrypted field row from the database (before/after decryption).
 */
export interface SectionField {
  id: string;
  key: string;
  value: string;
  iv: string;
  authTag: string;
  order: number;
}
