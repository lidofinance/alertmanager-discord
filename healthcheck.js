const handleHealthcheck = (ctx) => {
  ctx.status = 200;
  ctx.body = { status: "ok", uptime: process.uptime() };
};

module.exports = {
  handleHealthcheck,
};
