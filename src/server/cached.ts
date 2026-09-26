import "server-only";
import { cache } from "react";
import { getBrands, getPeople, getWorkItems } from "./queries";

/** Per-request memoised reads shared by the layout and pages. */
export const getOpenItems = cache(() => getWorkItems({}));
export const getAllBrands = cache(() => getBrands());
export const getActivePeople = cache(() => getPeople());
