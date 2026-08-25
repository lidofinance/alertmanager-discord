// The status code answers "the process serves", which is not the same as "the process can deliver":
// a config that loaded no routes serves 404s. There is no /metrics here, so the body is the only
// place that difference is visible.
const handleHealthcheck = (ctx) => {
  ctx.status = 200;
  ctx.body = {
    status: "ok",
    uptime: process.uptime(),
    routes: Object.keys(ctx.routes || {}).length,
    configLoadedAt: ctx.configLoadedAt,
  };
};

module.exports = {
  handleHealthcheck,
};
