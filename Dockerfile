FROM node:20.20.0-alpine as base
ENV NODE_ENV production

FROM base as deps
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive && yarn cache clean
COPY --chown=node:node . .

FROM base as prod
RUN apk add --no-cache tini=0.19.0-r3
COPY --from=deps /usr/src/app /usr/src/app
WORKDIR /usr/src/app
USER node
HEALTHCHECK CMD sh -c "wget -q http://localhost:${PORT:-5001}/health -O- || exit 1"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
