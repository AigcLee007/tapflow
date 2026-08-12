import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export function registerLegalRoutes(app: FastifyInstance): void {
  app.get("/api/v2/legal/manifest", async () => app.legalService.getManifest());

  app.get<{ Params: { type: string } }>("/api/v2/legal/documents/:type", async (request, reply) => {
    if (!app.legalService.isDocumentType(request.params.type)) {
      return sendNotFound(request, reply);
    }
    return app.legalService.getDocument(request.params.type);
  });
}

function sendNotFound(request: FastifyRequest, reply: FastifyReply) {
  return reply.code(404).send({
    error: {
      code: "LEGAL_DOCUMENT_NOT_FOUND",
      message: "未找到法律文件",
      requestId: request.ctx?.requestId ?? request.id,
    },
  });
}
