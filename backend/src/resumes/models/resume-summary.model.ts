/**
 * Lightweight resume shape returned by the list endpoint.
 */
export interface ResumeSummary {
  id: string;
  layout: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
}
