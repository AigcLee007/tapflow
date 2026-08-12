import { apiGet } from "../services/v2HttpClient";

export type LegalDocumentType = "terms" | "privacy";

export type LegalSection = {
  id: string;
  items?: string[];
  paragraphs: string[];
  title: string;
};

export type LegalDocument = {
  contactUrl?: string;
  effectiveAt: string;
  lastUpdatedAt: string;
  operatorName: "Aittco";
  sections: LegalSection[];
  title: string;
  type: LegalDocumentType;
  version: string;
};

export function getLegalDocument(type: LegalDocumentType): Promise<LegalDocument> {
  return apiGet<LegalDocument>(`/legal/documents/${type}`, { auth: false, retryOnUnauthorized: false });
}
