import type { FastifyReply, FastifyRequest } from "fastify";

function sendAuthError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.code(statusCode).send({
    error: {
      code,
      message,
      requestId: request.ctx.requestId,
    },
  });
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.ctx.isAuthenticated || !request.ctx.userId) {
    void sendAuthError(
      request,
      reply,
      401,
      "UNAUTHORIZED",
      "请先登录后再继续操作",
    );
  }
}

export async function requireTenant(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.ctx.tenantId) {
    void sendAuthError(
      request,
      reply,
      400,
      "TENANT_REQUIRED",
      "当前请求缺少工作区上下文",
    );
  }
}

export function requirePermission(permissionKey: string) {
  return async function permissionGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.ctx.isAuthenticated || !request.ctx.userId) {
      void sendAuthError(
        request,
        reply,
        401,
        "UNAUTHORIZED",
        "请先登录后再继续操作",
      );
      return;
    }

    if (!request.ctx.permissions.includes(permissionKey)) {
      void sendAuthError(
        request,
        reply,
        403,
        "FORBIDDEN",
        `Missing permission: ${permissionKey}`,
      );
    }
  };
}
