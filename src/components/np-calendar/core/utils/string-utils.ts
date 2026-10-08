export const nepaliDigitToEnglish: Record<string, string> = {
  "0": "०",
  "1": "१",
  "2": "२",
  "3": "३",
  "4": "४",
  "5": "५",
  "6": "६",
  "7": "७",
  "8": "८",
  "9": "९",
};
export class StringUtils {
  public convertEnglishDigitToNepali(num: number, locale: string, addPadStart?: boolean) {
    if (!num) {
      return "";
    }
    if (locale === "en") {
      return num.toString().padStart(2, "0");
    } else {
      const numArr = num.toString().split("");
      let equivalentNepaliNumber = numArr.map((item) => nepaliDigitToEnglish[item] ?? item).join("");
      if (addPadStart) {
        equivalentNepaliNumber = equivalentNepaliNumber.padStart(2, nepaliDigitToEnglish["0"]);
      }
      return equivalentNepaliNumber;
    }
  }
}
