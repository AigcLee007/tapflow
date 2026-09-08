export type ResultActionContext = {
  graphRevision: number;
  resultId: string;
  sessionId: string;
  turnId: string;
};

export type ResultActionReference = ResultActionContext & {
  assetId: string;
};

export type ResultActionPort = {
  preview(input: ResultActionReference): Promise<void>;
  refine(input: ResultActionReference): Promise<void>;
  select(input: ResultActionReference): Promise<void>;
  setReference(input: ResultActionReference): Promise<void>;
  variant(input: ResultActionReference): Promise<void>;
};

export type ResultActionType = "preview" | "refine" | "select" | "set_reference" | "variant";

export class ResultActions {
  constructor(private readonly port: ResultActionPort) {}

  dispatch(type: ResultActionType, input: ResultActionReference): Promise<void> {
    switch (type) {
      case "select":
        return this.port.select(input);
      case "preview":
        return this.port.preview(input);
      case "refine":
        return this.port.refine(input);
      case "variant":
        return this.port.variant(input);
      case "set_reference":
        return this.port.setReference(input);
    }
  }
}
