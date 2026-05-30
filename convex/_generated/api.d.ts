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
import type * as cafes from "../cafes.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as ingredients from "../ingredients.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_inventory from "../lib/inventory.js";
import type * as lib_pin from "../lib/pin.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_staff from "../lib/staff.js";
import type * as menu_categories from "../menu/categories.js";
import type * as menu_itemGroups from "../menu/itemGroups.js";
import type * as menu_items from "../menu/items.js";
import type * as menu_modifierGroups from "../menu/modifierGroups.js";
import type * as orders from "../orders.js";
import type * as recipes from "../recipes.js";
import type * as settings from "../settings.js";
import type * as shifts from "../shifts.js";
import type * as staff from "../staff.js";
import type * as users from "../users.js";
import type * as waste from "../waste.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  cafes: typeof cafes;
  dashboard: typeof dashboard;
  http: typeof http;
  ingredients: typeof ingredients;
  "lib/auth": typeof lib_auth;
  "lib/inventory": typeof lib_inventory;
  "lib/pin": typeof lib_pin;
  "lib/pricing": typeof lib_pricing;
  "lib/staff": typeof lib_staff;
  "menu/categories": typeof menu_categories;
  "menu/itemGroups": typeof menu_itemGroups;
  "menu/items": typeof menu_items;
  "menu/modifierGroups": typeof menu_modifierGroups;
  orders: typeof orders;
  recipes: typeof recipes;
  settings: typeof settings;
  shifts: typeof shifts;
  staff: typeof staff;
  users: typeof users;
  waste: typeof waste;
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
