/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as lib_consensus from "../lib/consensus.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_pitAggregate from "../lib/pitAggregate.js";
import type * as lib_statsMath from "../lib/statsMath.js";
import type * as lib_tbaMapping from "../lib/tbaMapping.js";
import type * as matches from "../matches.js";
import type * as model_authz from "../model/authz.js";
import type * as picklists from "../picklists.js";
import type * as pitReports from "../pitReports.js";
import type * as seed from "../seed.js";
import type * as stats from "../stats.js";
import type * as tba from "../tba.js";
import type * as tbaImport from "../tbaImport.js";
import type * as teams from "../teams.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  events: typeof events;
  http: typeof http;
  "lib/consensus": typeof lib_consensus;
  "lib/constants": typeof lib_constants;
  "lib/pitAggregate": typeof lib_pitAggregate;
  "lib/statsMath": typeof lib_statsMath;
  "lib/tbaMapping": typeof lib_tbaMapping;
  matches: typeof matches;
  "model/authz": typeof model_authz;
  picklists: typeof picklists;
  pitReports: typeof pitReports;
  seed: typeof seed;
  stats: typeof stats;
  tba: typeof tba;
  tbaImport: typeof tbaImport;
  teams: typeof teams;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
