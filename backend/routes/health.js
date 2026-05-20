export default async function healthRoutes(fastify, opts) {
  fastify.get("/health", async (req, reply) => reply.send({ status: "ok" }));
  fastify.get("/api/ping", async (req, reply) => reply.send({ message: "Pong! Server is running" }));
}