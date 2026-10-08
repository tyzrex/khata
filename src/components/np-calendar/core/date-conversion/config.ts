import { totalDaysInMonthsByYear } from "./data";

export const TOTAL_AVAILABLE_YEARS = totalDaysInMonthsByYear.length - 1;
export const RENDERABLE_YEARS_LENGTH = TOTAL_AVAILABLE_YEARS - 1;

export const STARTING_YEAR_BS = totalDaysInMonthsByYear[0][0];
export const RENDERABLE_STARTING_YEAR_BS = STARTING_YEAR_BS + 2;
export const STARTING_MONTH_BS = 9; //SPEAR HEAD NEPALI MONTH
export const STARTING_DATE_BS = 19; //SPEAR HEAD NEPALI MONTH
export const STARTING_DAY_BS = 6;
export const ENDING_YEAR_BS = totalDaysInMonthsByYear[TOTAL_AVAILABLE_YEARS][0];

export const STARTING_YEAR_AD = STARTING_YEAR_BS - 57;
export const RENDERABLE_STARTING_YEAR_AD = STARTING_YEAR_AD + 2;
export const STARTING_MONTH_AD = 4;
export const STARTING_DATE_AD = 11;
export const STARTING_DAY_AD = 1;
export const ENDING_YEAR_AD = ENDING_YEAR_BS - 57;
