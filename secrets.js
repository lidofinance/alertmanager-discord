/**
 * @note Copy of the secrets formatter from the `@lido-nestjs/logger`
 * https://github.com/lidofinance/lido-nestjs-modules/blob/main/packages/logger/src/format/secrets.format.ts
 */
const winston = require("winston");
const traverse = require("traverse");

const SECRET_REPLACER = "<removed>";

// A floor under the exact tokens from the config: a webhook URL or a bearer token that reaches a log
// line some other way, such as an error body or a hook no longer in the config, is still removed.
const SECRET_PATTERNS = [
  "https://discord(?:app)?\\.com/api/webhooks/[^\\s\"'\\\\]+",
  "https://hooks\\.slack\\.com/services/[^\\s\"'\\\\]+",
  "Bearer\\s+[A-Za-z0-9._~+/=-]+",
];

// Values under these keys are removed whatever they look like.
const SECRET_KEYS = /authorization|token|secret|password|webhook|^hook$/i;

const regExpEscape = (str) => {
  return str.replace(/[-[\]{}()*+?./\\^$|\s,]/g, "\\$&");
};

const cleanSecrets = winston.format((info, opts) => {
  const secrets = opts.secrets ?? [];
  const regex = opts.regex ?? SECRET_PATTERNS;

  return replace(secrets, regex, info);
});

const replace = (secrets, regex, message, traversal = true) => {
  if (typeof message === "string") {
    const withCleanedSecrets = secrets.reduce((result, secret) => {
      const re = new RegExp(regExpEscape(secret), "g");
      return secret ? result.replace(re, SECRET_REPLACER) : result;
    }, message);

    return regex.reduce((result, regex) => {
      const re = new RegExp(regex, "g");
      return result.replace(re, SECRET_REPLACER);
    }, withCleanedSecrets);
  }

  // Arrays are handled here as well
  if (typeof message === "object" && message !== null && traversal === true) {
    return traverse(message).map(function (node) {
      if (this.level >= 10) {
        this.update("Maximum secret sanitizing depth reached.");
        this.stop();
        return;
      }
      if (this.key !== undefined && SECRET_KEYS.test(this.key) && typeof node !== "object") {
        this.update(SECRET_REPLACER);
        return;
      }
      // IMPORTANT: Specify no traversing on recursive reads
      this.update(replace(secrets, regex, node, false));
    });
  }

  return message;
};

module.exports = {
  SECRET_PATTERNS,
  cleanSecrets,
};
