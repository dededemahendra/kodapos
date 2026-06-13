/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounting from "../accounting.js";
import type * as alerts from "../alerts.js";
import type * as auth from "../auth.js";
import type * as cafes from "../cafes.js";
import type * as cashMovements from "../cashMovements.js";
import type * as cashierSessions from "../cashierSessions.js";
import type * as crons from "../crons.js";
import type * as customers from "../customers.js";
import type * as dashboard from "../dashboard.js";
import type * as email from "../email.js";
import type * as expenses from "../expenses.js";
import type * as forecast from "../forecast.js";
import type * as giftCards from "../giftCards.js";
import type * as heldOrders from "../heldOrders.js";
import type * as http from "../http.js";
import type * as ingredients from "../ingredients.js";
import type * as kitchen from "../kitchen.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_demand from "../lib/demand.js";
import type * as lib_discount from "../lib/discount.js";
import type * as lib_expense from "../lib/expense.js";
import type * as lib_forecast from "../lib/forecast.js";
import type * as lib_giftcard from "../lib/giftcard.js";
import type * as lib_heldOrder from "../lib/heldOrder.js";
import type * as lib_inventory from "../lib/inventory.js";
import type * as lib_lowStockEmail from "../lib/lowStockEmail.js";
import type * as lib_loyalty from "../lib/loyalty.js";
import type * as lib_orderType from "../lib/orderType.js";
import type * as lib_payment from "../lib/payment.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_pin from "../lib/pin.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_receipt from "../lib/receipt.js";
import type * as lib_refund from "../lib/refund.js";
import type * as lib_restock from "../lib/restock.js";
import type * as lib_restockCompute from "../lib/restockCompute.js";
import type * as lib_sale from "../lib/sale.js";
import type * as lib_shiftSummary from "../lib/shiftSummary.js";
import type * as lib_staff from "../lib/staff.js";
import type * as lib_time from "../lib/time.js";
import type * as lib_weather from "../lib/weather.js";
import type * as loyalty from "../loyalty.js";
import type * as loyaltyRewards from "../loyaltyRewards.js";
import type * as menu_categories from "../menu/categories.js";
import type * as menu_itemGroups from "../menu/itemGroups.js";
import type * as menu_itemStock from "../menu/itemStock.js";
import type * as menu_items from "../menu/items.js";
import type * as menu_modifierGroups from "../menu/modifierGroups.js";
import type * as menu_variants from "../menu/variants.js";
import type * as orders from "../orders.js";
import type * as otherIncome from "../otherIncome.js";
import type * as payments_providers_index from "../payments/providers/index.js";
import type * as payments_providers_mock from "../payments/providers/mock.js";
import type * as payments_providers_types from "../payments/providers/types.js";
import type * as payments_providers_util from "../payments/providers/util.js";
import type * as payments_providers_xendit from "../payments/providers/xendit.js";
import type * as payments_qrisDynamic from "../payments/qrisDynamic.js";
import type * as promotions from "../promotions.js";
import type * as public_ from "../public.js";
import type * as purchaseOrders from "../purchaseOrders.js";
import type * as purchases from "../purchases.js";
import type * as recipes from "../recipes.js";
import type * as refunds from "../refunds.js";
import type * as reports from "../reports.js";
import type * as reservations from "../reservations.js";
import type * as restock from "../restock.js";
import type * as selfOrders from "../selfOrders.js";
import type * as settings from "../settings.js";
import type * as shifts from "../shifts.js";
import type * as staff from "../staff.js";
import type * as suppliers from "../suppliers.js";
import type * as tables from "../tables.js";
import type * as timeClock from "../timeClock.js";
import type * as users from "../users.js";
import type * as waste from "../waste.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounting: typeof accounting;
  alerts: typeof alerts;
  auth: typeof auth;
  cafes: typeof cafes;
  cashMovements: typeof cashMovements;
  cashierSessions: typeof cashierSessions;
  crons: typeof crons;
  customers: typeof customers;
  dashboard: typeof dashboard;
  email: typeof email;
  expenses: typeof expenses;
  forecast: typeof forecast;
  giftCards: typeof giftCards;
  heldOrders: typeof heldOrders;
  http: typeof http;
  ingredients: typeof ingredients;
  kitchen: typeof kitchen;
  "lib/auth": typeof lib_auth;
  "lib/demand": typeof lib_demand;
  "lib/discount": typeof lib_discount;
  "lib/expense": typeof lib_expense;
  "lib/forecast": typeof lib_forecast;
  "lib/giftcard": typeof lib_giftcard;
  "lib/heldOrder": typeof lib_heldOrder;
  "lib/inventory": typeof lib_inventory;
  "lib/lowStockEmail": typeof lib_lowStockEmail;
  "lib/loyalty": typeof lib_loyalty;
  "lib/orderType": typeof lib_orderType;
  "lib/payment": typeof lib_payment;
  "lib/phone": typeof lib_phone;
  "lib/pin": typeof lib_pin;
  "lib/pricing": typeof lib_pricing;
  "lib/receipt": typeof lib_receipt;
  "lib/refund": typeof lib_refund;
  "lib/restock": typeof lib_restock;
  "lib/restockCompute": typeof lib_restockCompute;
  "lib/sale": typeof lib_sale;
  "lib/shiftSummary": typeof lib_shiftSummary;
  "lib/staff": typeof lib_staff;
  "lib/time": typeof lib_time;
  "lib/weather": typeof lib_weather;
  loyalty: typeof loyalty;
  loyaltyRewards: typeof loyaltyRewards;
  "menu/categories": typeof menu_categories;
  "menu/itemGroups": typeof menu_itemGroups;
  "menu/itemStock": typeof menu_itemStock;
  "menu/items": typeof menu_items;
  "menu/modifierGroups": typeof menu_modifierGroups;
  "menu/variants": typeof menu_variants;
  orders: typeof orders;
  otherIncome: typeof otherIncome;
  "payments/providers/index": typeof payments_providers_index;
  "payments/providers/mock": typeof payments_providers_mock;
  "payments/providers/types": typeof payments_providers_types;
  "payments/providers/util": typeof payments_providers_util;
  "payments/providers/xendit": typeof payments_providers_xendit;
  "payments/qrisDynamic": typeof payments_qrisDynamic;
  promotions: typeof promotions;
  public: typeof public_;
  purchaseOrders: typeof purchaseOrders;
  purchases: typeof purchases;
  recipes: typeof recipes;
  refunds: typeof refunds;
  reports: typeof reports;
  reservations: typeof reservations;
  restock: typeof restock;
  selfOrders: typeof selfOrders;
  settings: typeof settings;
  shifts: typeof shifts;
  staff: typeof staff;
  suppliers: typeof suppliers;
  tables: typeof tables;
  timeClock: typeof timeClock;
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
