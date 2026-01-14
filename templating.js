const sqrl = require("squirrelly");

sqrl.filters.define("d", (value, defaultValue) => {
  return value || defaultValue;
});

const titleTmpl = process.env.TITLE_TMPL || "";
const descrTmpl = process.env.DESCR_TMPL || "";

const compileTitle = (alert) => {
  return sqrl.render(titleTmpl, alert).trim();
};

const compileDescr = (alert) => {
  return sqrl.render(descrTmpl, alert).trim();
};

module.exports = {
  compileTitle,
  compileDescr,
};
