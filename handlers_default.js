const axios = require("axios");
const { compileTitle, compileDescr } = require("./templating");
const marked = require("marked");

const colors = { firing: 0xd50000, resolved: 0x00c853, default: 0x333333 };

function getMentions(alert) {
  const mentions = alert.labels["mentions"];
  if (!mentions) {
    return [];
  }

  return mentions
    .replace(/\s/g, "")
    .split(",")
    .filter(Boolean)
    .map((m) => `<@${m}>`);
}

/**
 * @typedef MarkedList
 * @prop {Array.<{text: string}} items
 */

function getFields(alert) {
  /** @type {string} */
  const fields_markdown = alert.annotations?.inline_fields;
  if (!fields_markdown) {
    return [];
  }

  try {
    const parsed = marked.lexer(fields_markdown);
    /** @type {MarkedList?} */
    const fields = parsed.filter((e) => e.type === "list").at(0);
    validateFieldsList(fields);
    return transformFieldsList(fields);
  } catch (err) {
    console.error(err);
    return [];
  }
}

/**
 * @param {MarkedList?} list
 */
function validateFieldsList(list) {
  const fields = list?.items?.map((e) => e.text);

  if (!fields) {
    throw new Error("Fields list is empty");
  }

  if (fields.length > 25) {
    throw new Error("Too many fields");
  }

  fields.forEach((e) => {
    if (e.length > 1024) {
      throw new Error("Too many characters in a field");
    }
  });
}

/**
 * @param {MarkedList} list
 */
function transformFieldsList(list) {
  return list.items.map((e) => {
    return { name: "", value: e.text.trim(), inline: true };
  });
}

async function handleHook(ctx) {
  ctx.status = 200;

  let hook = ctx.routes[ctx.params.slug];
  if (hook === undefined) {
    ctx.status = 404;
    console.warn(`Slug "${ctx.params.slug}" was not found in routes`);
    return;
  }

  if (ctx.request.body === undefined || !Array.isArray(ctx.request.body.alerts)) {
    ctx.status = 400;
    console.error("Unexpected request from Alertmanager:", ctx.request.body);
    return;
  }

  const objectsToSend = [];

  ctx.request.body.alerts.forEach((alert) => {
    try {
      const description = alert.annotations?.description;
      const summary = alert.annotations?.summary;
      if (!summary && !description) return;

      let body = {
        embeds: [
          {
            title: compileTitle(alert) || summary,
            description: compileDescr(alert) || description,
            color: colors[alert.status] || colors.default,
          },
        ],
      };

      const mentions = getMentions(alert);
      if (mentions.length) {
        body.allowed_mentions = { parse: ["users", "roles"] };
        body.content = mentions.join(" ");
      }

      const fields = getFields(alert);
      if (fields.length) {
        body.embeds.at(0).fields = fields;
      }

      objectsToSend.push(body);
    } catch (err) {
      console.error(err);
    }
  });

  if (!objectsToSend.length) {
    ctx.status = 400;
    console.warn(
      "Nothing to send, all alerts has been filtered out. Recieved data:",
      ctx.request.body.alerts
    );
    return;
  }

  for (const body of objectsToSend) {
    await axios.post(hook, body, { params: ctx.query }).catch((err) => {
      ctx.status = 500;
      console.error(err);
      return;
    });
  }

  console.log(`${objectsToSend.length} objects have been sent`);
}

async function handleHealthcheck(ctx) {
  let hook;

  for (const key in ctx.routes) {
    hook = ctx.routes[key];
    break;
  }

  if (hook === undefined) {
    console.warn("No routes has been configured!");
    ctx.status = 503;
    return;
  }

  await axios
    .get(hook)
    .then(() => {
      ctx.status = 200;
      ctx.body = { uptime: process.uptime() };
    })
    .catch((err) => {
      ctx.status = 503;
      if (err.response && err.response.data) {
        console.error(err.response.data);
      } else {
        console.error(err);
      }
    });
}

module.exports = {
  handleHook,
  handleHealthcheck,
  getMentions,
  getFields,
};