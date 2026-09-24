import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import {
  adjacencyGraphs,
  dictionary as commonDictionary,
} from "@zxcvbn-ts/language-common";
import { dictionary } from "@zxcvbn-ts/language-en";
import {
  MIN_PASSCODE_LENGTH,
  MIN_PASSCODE_STRENGTH_SCORE,
} from "@/constants/passcode";

export { MIN_PASSCODE_LENGTH, MIN_PASSCODE_STRENGTH_SCORE };

const factory = new ZxcvbnFactory({
  graphs: adjacencyGraphs,
  dictionary: {
    ...commonDictionary,
    ...dictionary,
  },
});

export type PasscodeStrengthResult = {
  score: number;
  isValid: boolean;
  reasons: string[];
};

export function evaluatePasscodeStrength(
  passcode: string,
): PasscodeStrengthResult {
  const reasons: string[] = [];
  if (/[^\x21-\x7E]/.test(passcode)) {
    reasons.push("半角英数字（大文字、小文字）、半角記号のみ使用できます");
  }
  if (passcode.length < MIN_PASSCODE_LENGTH) {
    reasons.push(`パスコードは${MIN_PASSCODE_LENGTH}文字以上にしてください`);
  }
  const result = factory.check(passcode);
  if (result.score < MIN_PASSCODE_STRENGTH_SCORE) {
    reasons.push(
      "推測されやすいパスコードです。単純な繰り返しや連続した文字は避けてください",
    );
  }
  return {
    score: result.score,
    isValid: reasons.length === 0,
    reasons,
  };
}
