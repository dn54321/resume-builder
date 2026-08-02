/**
 * Full resume shape exposed by the controller (sections are untyped in the API).
 */
export interface ResumeFull {
  id: string;
  userId: string;
  layout: string;
  sections: unknown[];
}
