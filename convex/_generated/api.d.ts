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
import type * as crons from "../crons.js";
import type * as customers from "../customers.js";
import type * as dashboard from "../dashboard.js";
import type * as forecast from "../forecast.js";
import type * as http from "../http.js";
import type * as ingredients from "../ingredients.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_demand from "../lib/demand.js";
import type * as lib_forecast from "../lib/forecast.js";
import type * as lib_inventory from "../lib/inventory.js";
import type * as lib_loyalty from "../lib/loyalty.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_pin from "../lib/pin.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_restock from "../lib/restock.js";
import type * as lib_restockCompute from "../lib/restockCompute.js";
import type * as lib_staff from "../lib/staff.js";
import type * as lib_time from "../lib/time.js";
import type * as lib_weather from "../lib/weather.js";
import type * as loyalty from "../loyalty.js";
import type * as menu_categories from "../menu/categories.js";
import type * as menu_itemGroups from "../menu/itemGroups.js";
import type * as menu_itemStock from "../menu/itemStock.js";
import type * as menu_items from "../menu/items.js";
import type * as menu_modifierGroups from "../menu/modifierGroups.js";
import type * as orders from "../orders.js";
import type * as promotions from "../promotions.js";
import type * as purchases from "../purchases.js";
import type * as recipes from "../recipes.js";
import type * as reports from "../reports.js";
import type * as restock from "../restock.js";
import type * as settings from "../settings.js";
import type * as shifts from "../shifts.js";
import type * as staff from "../staff.js";
import type * as suppliers from "../suppliers.js";
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
  crons: typeof crons;
  customers: typeof customers;
  dashboard: typeof dashboard;
  forecast: typeof forecast;
  http: typeof http;
  ingredients: typeof ingredients;
  "lib/auth": typeof lib_auth;
  "lib/demand": typeof lib_demand;
  "lib/forecast": typeof lib_forecast;
  "lib/inventory": typeof lib_inventory;
  "lib/loyalty": typeof lib_loyalty;
  "lib/phone": typeof lib_phone;
  "lib/pin": typeof lib_pin;
  "lib/pricing": typeof lib_pricing;
  "lib/restock": typeof lib_restock;
  "lib/restockCompute": typeof lib_restockCompute;
  "lib/staff": typeof lib_staff;
  "lib/time": typeof lib_time;
  "lib/weather": typeof lib_weather;
  loyalty: typeof loyalty;
  "menu/categories": typeof menu_categories;
  "menu/itemGroups": typeof menu_itemGroups;
  "menu/itemStock": typeof menu_itemStock;
  "menu/items": typeof menu_items;
  "menu/modifierGroups": typeof menu_modifierGroups;
  orders: typeof orders;
  promotions: typeof promotions;
  purchases: typeof purchases;
  recipes: typeof recipes;
  reports: typeof reports;
  restock: typeof restock;
  settings: typeof settings;
  shifts: typeof shifts;
  staff: typeof staff;
  suppliers: typeof suppliers;
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
