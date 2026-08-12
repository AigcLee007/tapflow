import { LEGAL_DOCUMENTS, type LegalDocument, type LegalDocumentType } from "./legal.documents.js";

export type LegalDocumentResponse = LegalDocument & { contactUrl: string };

export class LegalService {
  constructor(private readonly options: { legalContactUrl: string }) {}

  getManifest() {
    return {
      privacy: this.getManifestEntry("privacy"),
      terms: this.getManifestEntry("terms"),
    };
  }

  getDocument(type: LegalDocumentType): LegalDocumentResponse {
    return { ...LEGAL_DOCUMENTS[type], contactUrl: this.options.legalContactUrl };
  }

  isDocumentType(value: string): value is LegalDocumentType {
    return value === "terms" || value === "privacy";
  }

  private getManifestEntry(type: LegalDocumentType) {
    const document = LEGAL_DOCUMENTS[type];
    return { effectiveAt: document.effectiveAt, requiresConsent: true, version: document.version };
  }
}
