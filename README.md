# livestock-data-catalogue-ui

[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_livestock-data-catalogue-ui&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DEFRA_livestock-data-catalogue-ui)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_livestock-data-catalogue-ui&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_livestock-data-catalogue-ui)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_livestock-data-catalogue-ui&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DEFRA_livestock-data-catalogue-ui)

Core delivery platform Node.js Frontend Template.

- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Server-side Caching](#server-side-caching)
- [Redis](#redis)
- [Proxy](#proxy)
- [Authentication](#authentication)
  - [How sign-in works](#how-sign-in-works)
  - [Routes that do not need sign-in](#routes-that-do-not-need-sign-in)
  - [Environment variables](#environment-variables)
  - [CDP configuration](#cdp-configuration)
  - [App Registration settings](#app-registration-settings)
  - [Signing in locally](#signing-in-locally)
  - [Personal data](#personal-data)
- [Local Development](#local-development)
  - [Setup](#setup)
  - [Development](#development)
  - [Production](#production)
  - [Npm scripts](#npm-scripts)
  - [Update dependencies](#update-dependencies)
  - [Formatting](#formatting)
    - [Windows prettier issue](#windows-prettier-issue)
- [Docker](#docker)
  - [Development image](#development-image)
  - [Production image](#production-image)
  - [Docker Compose](#docker-compose)
  - [Dependabot](#dependabot)
  - [SonarCloud](#sonarcloud)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## Requirements

### Node.js

Please install Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd livestock-data-catalogue-ui
nvm use
```

## Server-side Caching

We use Catbox for server-side caching. By default the service will use CatboxRedis when deployed and CatboxMemory for
local development.
You can override the default behaviour by setting the `SESSION_CACHE_ENGINE` environment variable to either `redis` or
`memory`.

Please note: CatboxMemory (`memory`) is _not_ suitable for production use! The cache will not be shared between each
instance of the service and it will not persist between restarts.

## Redis

Redis is an in-memory key-value store. Every instance of a service has access to the same Redis key-value store similar
to how services might have a database (or MongoDB). All frontend services are given access to a namespaced prefixed that
matches the service name. e.g. `my-service` will have access to everything in Redis that is prefixed with `my-service`.

If your service does not require a session cache to be shared between instances or if you don't require Redis, you can
disable setting `SESSION_CACHE_ENGINE=false` or changing the default value in `src/config/index.js`.

## Proxy

We are using forward-proxy which is set up by default. Services are automatically configured with the proxy environment variables when deployed.

Node.js 24 uses these variables to route outbound HTTP(S) requests through the proxy:

NODE_USE_ENV_PROXY=1
HTTPS_PROXY=...
NO_PROXY=...

No additional proxy configuration is required in the service.

## Authentication

Every page needs staff to sign in with their Microsoft Entra ID (Defra) account, following the
[Defra Entra guide (9.8)](https://defra.github.io/software-development-standards/guides/entra/). Ticket:
[LDATSPR-8](https://eaflood.atlassian.net/browse/LDATSPR-8).

The service uses CDP's [`@defra/hapi-auth-oidc`](https://github.com/DEFRA/cdp-libraries/tree/main/packages/hapi-auth-oidc)
for the sign-in flow and [`@hapi/cookie`](https://hapi.dev/module/cookie/) for the signed-in session, following
[CDP's guide](https://github.com/DEFRA/cdp-documentation/blob/main/how-to/federated-credentials/node-integration.md).
There is no client secret: the service proves who it is to Entra ID with a short-lived AWS STS web identity token
(a federated credential).

### How sign-in works

1. A user who is not signed in asks for a page, for example `/about`. They are sent to
   `/auth/sign-in?next=%2Fabout`.
2. `/auth/sign-in` stores the return path in the session store (yar), if it is a path on this service, and sends the
   user to Entra ID. The request uses the authorisation code flow with PKCE and asks for these scopes:
   `api://<ENTRA_CLIENT_ID>/<ENTRA_API_SCOPE> openid profile email offline_access user.read`. The API scope comes first,
   so the access token is for the backend API.
3. Entra ID sends the user back to `/auth/callback`. When deployed this is a form POST (`form_post`). The service checks
   the state and PKCE values, exchanges the code for tokens and creates a session under a new random ID. The user's
   details and tokens are stored server-side in Redis, and the browser gets a cookie holding only the session ID.
4. The browser doesn't send `SameSite=Lax` cookies with Entra ID's cross-site POST, so the callback redirects (303) to
   `/auth/signed-in`. That route reads the return path, starts a new session store (to prevent session fixation) and
   sends the user to the page they asked for.
5. On each request the session is looked up in Redis. If the access token is close to expiry it is refreshed. If the
   refresh fails, the session is deleted and the user has to sign in again.
6. `/auth/sign-out` deletes the session and cookie, then sends the user to Entra ID's sign-out page, which returns them
   to `/auth/signed-out`. If Entra ID can't be reached, the user is signed out of this service and sent straight to
   `/auth/signed-out`.

Return paths must be on this service and not under `/auth/` (checked after decoding); anything else returns the user to
`/`. A signed-in user who visits `/auth/sign-in` is sent straight on, so a link from another site can't end their
session by starting a new sign-in.

The access token is kept on the server for calls to the backend API, which validates it. It is never sent to the
browser.

### Routes that do not need sign-in

`/health`, static assets (`/public/...` and `/favicon.ico`), `/auth/sign-in`, `/auth/callback`, `/auth/signed-out`,
`/auth/sign-out`, the cookies page and its form (`/cookies`), and error pages.

### Environment variables

| Name                                  | Purpose                                                                                                                                     | Default                                              | Required      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------- |
| `ENTRA_TENANT_ID`                     | Entra ID tenant (directory) ID. Used to find Entra ID at `https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration` | Placeholder GUID locally, none in production         | In production |
| `ENTRA_CLIENT_ID`                     | Application (client) ID of the App Registration shared with the backend                                                                     | Placeholder GUID locally, none in production         | In production |
| `ENTRA_API_SCOPE`                     | Name of the API scope the App Registration exposes for the backend                                                                          | `access_as_user`                                     | No            |
| `APP_BASE_URL`                        | Public address of this service, used for the callback and signed-out addresses. Must use `https://` in production                           | `http://localhost:3000` locally, none in production  | In production |
| `ENTRA_RESPONSE_MODE`                 | How Entra ID returns the sign-in response: `form_post` or `query`                                                                           | `form_post` in production, `query` locally           | No            |
| `ENTRA_TOKEN_PROVIDER`                | Where the federated credential token comes from: `web-identity` or `mock`. Production refuses `mock`                                        | `web-identity` in production, `mock` locally         | No            |
| `ENTRA_FEDERATED_CREDENTIAL_AUDIENCE` | Audience of the AWS STS token. Must match the federated credential                                                                          | `api://AzureADTokenExchange`                         | No            |
| `ENTRA_STATE_COOKIE_SECURE`           | Only send the sign-in state cookie over HTTPS. Production refuses `false`                                                                   | `true` in production, `false` locally                | No            |
| `ENTRA_STATE_COOKIE_SAME_SITE`        | SameSite setting of the sign-in state cookie: `None` (needed for `form_post`) or `Lax`                                                      | `None` in production, `Lax` locally                  | No            |
| `SESSION_COOKIE_PASSWORD`             | Secret that encrypts the session, sign-in and sign-in state cookies. At least 32 characters. Set it as a secret in the CDP Portal           | A development-only value locally, none in production | In production |
| `SESSION_COOKIE_SECURE`               | Only send the session and sign-in cookies over HTTPS. Production refuses `false`                                                            | `true` in production, `false` locally                | No            |
| `SESSION_COOKIE_TTL`                  | How long the session and sign-in cookies last after the user's last request, in milliseconds                                                | 4 hours                                              | No            |
| `SESSION_CACHE_TTL`                   | How long a session (including the user's details and tokens) is kept in Redis after it was last saved, in milliseconds                      | 4 hours                                              | No            |

In production (`NODE_ENV=production`, which includes every CDP environment) the service refuses to start if
`ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `APP_BASE_URL` or `SESSION_COOKIE_PASSWORD` is missing, if `APP_BASE_URL`
doesn't use `https://`, if `ENTRA_TOKEN_PROVIDER` is `mock`, or if `SESSION_COOKIE_SECURE` or
`ENTRA_STATE_COOKIE_SECURE` is `false`. The error names the variables but never prints their values.

[.env.example](./.env.example) lists the variables for local use.

### CDP configuration

- Set `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` and `APP_BASE_URL` for each environment in the CDP Portal. They aren't
  secrets. For dev, `APP_BASE_URL` is `https://livestock-data-catalogue-ui.dev.cdp-int.defra.cloud`.
- Make sure `SESSION_COOKIE_PASSWORD` is set as a secret for each environment in the CDP Portal (Secrets tab) before
  deploying. The service won't start without it.
- Calls to Entra ID and AWS STS go through the platform proxy. CDP sets `NODE_USE_ENV_PROXY=1`, `HTTPS_PROXY` and
  `NO_PROXY` on every service (see [Proxy](#proxy) and
  [CDP's proxy guide](https://github.com/DEFRA/cdp-documentation/blob/main/how-to/proxy.md)).
  `login.microsoftonline.com` and `.amazonaws.com` are on CDP's default allow list, so no proxy change is needed.
- Ask for a federated credential on the App Registration for each environment, as described in
  [CDP's App Registration guide](https://github.com/DEFRA/cdp-documentation/blob/main/how-to/federated-credentials/web-identity-app-reg.md):
  - scenario: Other issuer
  - issuer: the environment's `CDP_JWT_ISSUER`
  - subject: `arn:aws:iam::<AWS_ACCOUNT>:role/livestock-data-catalogue-ui`
  - audience: the value of `ENTRA_FEDERATED_CREDENTIAL_AUDIENCE` (`api://AzureADTokenExchange` by default)

### App Registration settings

The UI needs these on the App Registration it shares with the backend. Use the `O365_DefraDev` tenant for local and
lower environments and the `Defra` tenant for higher environments, including production; CCoE makes the changes.

- Web redirect URIs, for each environment: `<APP_BASE_URL>/auth/callback` and `<APP_BASE_URL>/auth/signed-out`. For
  dev: `https://livestock-data-catalogue-ui.dev.cdp-int.defra.cloud/auth/callback` and
  `https://livestock-data-catalogue-ui.dev.cdp-int.defra.cloud/auth/signed-out`.
- An exposed API scope named `ENTRA_API_SCOPE` (default `access_as_user`), with the Application ID URI
  `api://<ENTRA_CLIENT_ID>`.
- The Microsoft Graph `User.Read` delegated permission, with admin consent. Without it users can't finish signing in.
- The app roles `Administrator`, `DataSteward` and `DataOwner`. The service stores the user's roles but doesn't check
  them yet, so anyone Entra ID lets sign in can use every page.
- "Assignment required" turned on for the Enterprise Application, with only the staff (or security groups) who need
  the catalogue assigned. Without it, any account in the tenant, including guest accounts, can sign in.
- The optional `login_hint` claim in the ID token, so sign-out can skip Entra ID's account picker.
- No front-channel logout URL: the service doesn't support it yet.

### Signing in locally

There is no local sign-in yet. Locally the service starts and `/health` works, but every page redirects to
`/auth/sign-in`, which can't complete without the real App Registration. The pages that don't need sign-in (for
example `/cookies` and `/auth/signed-out`) work, but in `npm run dev` their styles and scripts don't load, because the
Vite development server's asset route also needs sign-in.

`docker compose up` runs this service with `NODE_ENV=production`, so it won't start without real Entra ID values, an
`https://` `APP_BASE_URL`, a `SESSION_COOKIE_PASSWORD` and secure cookies.

### Personal data

While a user is signed in, Redis holds their Entra ID object ID, name, email address, app roles, login hint, and
access and refresh tokens. They are kept for `SESSION_CACHE_TTL` after the session was last saved, and deleted when
the user signs out. Logs never contain tokens, names, email addresses or object IDs.

If you change `SESSION_COOKIE_TTL`, update the expiry times on the cookies page to match.

## Local Development

### Setup

Install application dependencies:

```bash
npm install
```

### Git hooks

Install git hooks (optional)

```bash
npm run git:hooks
```

### Development

To run the application in `development` mode run:

```bash
npm run dev
```

### Production

To mimic the application running in `production` mode locally run:

```bash
npm start
```

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json)
To view them in your command line run:

```bash
npm run
```

### Update dependencies

To update dependencies use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

> The following script is a good start. Check out all the options on
> the [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
ncu --interactive --format group
```

### Formatting

#### Windows prettier issue

If you are having issues with formatting of line breaks on Windows update your global git config by running:

```bash
git config --global core.autocrlf false
```

## Docker

### Development image

> [!TIP]
> For Apple Silicon users, you may need to add `--platform linux/amd64` to the `docker run` command to ensure
> compatibility fEx: `docker build --platform=linux/arm64 --no-cache --tag livestock-data-catalogue-ui`

Build:

```bash
docker build --target development --no-cache --tag livestock-data-catalogue-ui:development .
```

Run:

```bash
docker run -p 3000:3000 livestock-data-catalogue-ui:development
```

### Production image

Build:

```bash
docker build --no-cache --tag livestock-data-catalogue-ui .
```

Run:

```bash
docker run -p 3000:3000 livestock-data-catalogue-ui
```

### Docker Compose

A local environment with:

- Floci (replacing Localstack) for AWS services (S3, SQS)
- Redis
- MongoDB
- This service.
- A commented out backend example.

```bash
docker compose up --build -d
```

### Dependabot

We have added an example dependabot configuration file to the repository. You can enable it by renaming
the [.github/example.dependabot.yml](.github/example.dependabot.yml) to `.github/dependabot.yml`

### SonarCloud

SonarCloud analyses pull requests from this repository and every push to
`main`. See the
[project dashboard](https://sonarcloud.io/summary/new_code?id=DEFRA_livestock-data-catalogue-ui).

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
