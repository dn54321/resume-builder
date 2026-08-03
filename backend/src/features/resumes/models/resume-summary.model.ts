/**
 * Lightweight resume shape returned by the list endpoint.
 */
export interface ResumeSummary {
  id: string;
  name: string | null;
  layout: string;
  createdAt: Date;
  updatedAt: Date;
}
