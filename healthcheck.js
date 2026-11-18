// /health is liveness: the process serves. /ready is readiness: routes are loaded and the process
// is not shutting down, so it can deliver.
const routeCount = (ctx) => Object.keys(ctx.routes || {}).length;

const handleHealthcheck = (ctx) => {
  ctx.status = 200;
  ctx.body = {
    status: "ok",
    uptime: process.uptime(),
    routes: routeCount(ctx),
    configLoadedAt: ctx.configLoadedAt,
  };
};

const handleReadiness = (ctx) => {
  const routes = routeCount(ctx);
  let status = "ready";
  if (ctx.shuttingDown) {
    status = "shutting down";
  } else if (routes === 0) {
    status = "no routes";
  }

  ctx.status = status === "ready" ? 200 : 503;
  ctx.body = { status, routes };
};

module.exports = {
  handleHealthcheck,
  handleReadiness,
};
